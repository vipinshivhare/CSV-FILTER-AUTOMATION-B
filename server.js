const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const { Readable } = require('stream');

const app = express();

// CORS configuration
app.use(cors({
    origin: ["http://localhost:3000", "https://stalwart-smakager-f487c2.netlify.app"], // Dono allow karo
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Content-Disposition'] // Ye line zaroori hai file download ke liye
}));
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// API 1: Get Headers (No changes needed)
app.post('/get-headers', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send("File missing");
    
    // const stream = Readable.from(req.file.buffer.toString());
    const stream = new Readable();
    stream.push(req.file.buffer);
    stream.push(null);
    let headersSent = false;

    stream.pipe(csv())
        .on('headers', (headers) => {
            if (!headersSent) {
                headersSent = true;
                res.json({ headers });
            }
        })
        .on('error', () => res.status(500).send("Error reading headers"));
});

// API 2: Get Unique Column Values (Sorting added for better UI)
app.post('/get-column-values', upload.single('file'), (req, res) => {
    const { columnName } = req.body;
    if (!columnName) return res.status(400).send("Column name missing");

    const values = new Set();
    const stream = Readable.from(req.file.buffer.toString());

    stream.pipe(csv())
        .on('data', (row) => {
            if (row[columnName]) values.add(row[columnName].trim());
        })
        .on('end', () => {
            res.json({ values: Array.from(values).sort() }); 
        })
        .on('error', () => res.status(500).send("Error fetching values"));
});

// API 3: Filter & Download (THE FIX IS HERE)
app.post('/filter-csv', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send("File missing");

    const { filters, selectedColumns } = req.body;
    
    // JSON parse carefully to avoid crashes
    let activeFilters = {};
    let targetCols = [];
    try {
        activeFilters = JSON.parse(filters || "{}");
        targetCols = JSON.parse(selectedColumns || "[]");
    } catch (e) {
        return res.status(400).send("Invalid JSON in filters or columns");
    }
    
    const results = [];
    const stream = Readable.from(req.file.buffer.toString());

    stream.pipe(csv())
        .on('data', (row) => {
            // Logic: Check if row matches ALL active filters
            let isMatch = true;
            
            for (const col in activeFilters) {
                const selectedOptions = activeFilters[col]; // This is an array like ['Paid', 'Pending']
                const rowValue = row[col]?.trim();

                if (selectedOptions && selectedOptions.length > 0) {
                    if (!selectedOptions.includes(rowValue)) {
                        isMatch = false;
                        break; // Fail fast: ek bhi match nahi hua toh skip
                    }
                }
            }

            if (isMatch) {
                // Only pick the columns user wants to export
                if (targetCols.length > 0) {
                    let filteredRow = {};
                    targetCols.forEach(col => {
                        filteredRow[col] = row[col] || "";
                    });
                    results.push(filteredRow);
                } else {
                    results.push(row);
                }
            }
        })
        .on('end', () => {
            if (results.length === 0) {
                return res.status(404).send("No data found matching these criteria");
            }

            try {
                const json2csvParser = new Parser({ 
                    fields: targetCols.length > 0 ? targetCols : Object.keys(results[0]) 
                });
                const csvOutput = json2csvParser.parse(results);

                res.header('Content-Type', 'text/csv');
                res.attachment('Custom_Export.csv');
                res.status(200).send(csvOutput);
            } catch (err) {
                res.status(500).send("Error generating CSV file");
            }
        })
        .on('error', (err) => {
            res.status(500).send("Stream error");
        });
});

// Backend main file (index.js) mein add karein
app.get('/', (req, res) => res.send("MASAI-CSV-GENIUS API is Live! 🚀"));

// app.listen(8000, '0.0.0.0', () => console.log(`🚀 Backend running on http://localhost:8000`));
const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Backend running on port ${PORT}`));