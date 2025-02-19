const newman = require("newman"); // Newman module
const path = require("path"); // Handle file paths
const fs = require("fs"); // File system module
const csv = require("csv-parser"); // CSV parser module
const { parse } = require("json2csv"); // For converting JSON to CSV

// File paths
const inputFilePath = path.resolve(__dirname, "prokerala_api - Sheet1.csv");
const outputFilePath = path.resolve(__dirname, "output.csv");
const imageFolderPath = path.resolve(__dirname, "images");

// Initialize the output file
function initializeOutputFile() {
  fs.copyFileSync(inputFilePath, outputFilePath);
  console.log(`Copied data from ${inputFilePath} to ${outputFilePath}`);
}

// Ensure a folder exists or create it
function ensureFolderExists(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`Created folder: ${folderPath}`);
  }
}

// Save SVG content to a file
function saveSVGToFolder(folderName, fileName, svgContent) {
  const folderPath = path.join(imageFolderPath, folderName);
  ensureFolderExists(folderPath);

  const filePath = path.join(folderPath, fileName);
  fs.writeFileSync(filePath, svgContent, "utf8");
  console.log(`Saved SVG file to ${filePath}`);
}

// Update a specific row in the CSV file
function updateCSVRow(rowIndex, updatedData) {
  const rows = [];
  fs.createReadStream(outputFilePath)
    .pipe(csv())
    .on("data", (row) => rows.push(row))
    .on("end", () => {
      if (rows[rowIndex]) {
        Object.assign(rows[rowIndex], updatedData);
      }
      const updatedCSV = parse(rows);
      fs.writeFileSync(outputFilePath, updatedCSV, "utf8");
      console.log(`Row ${rowIndex + 1} updated in ${outputFilePath}`);
    });
}

// Run Newman and handle responses
function runNewman() {
  newman
    .run({
      collection: require("./prokerala.postman_collection.json"),
      environment: require("./prokerala_env.postman_environment.json"),
      iterationData: inputFilePath,
      reporters: "cli",
    })
    .on("request", async (error, data) => {
      if (error) {
        console.error("Request error:", error);
        return;
      }

      const iterationIndex = data.cursor.iteration;
      const requestName = data?.item?.name;
      console.log(
        `Processing iteration: ${iterationIndex + 1}, Request: ${requestName}`
      );

      const responseText = data.response.stream.toString();

      if (isSVGResponse(responseText)) {
        handleSVGResponse(iterationIndex, responseText, requestName);
      } else {
        handleJSONResponse(iterationIndex, responseText);
      }
    })
    .on("done", (err) => {
      if (err) {
        console.error("Error during Newman run:", err);
      } else {
        console.log("Newman run complete. All data written to output.csv");
      }
    });
}

// Check if the response is an SVG
function isSVGResponse(responseText) {
  return (
    responseText.trim().startsWith("<?xml") ||
    responseText.trim().startsWith("<svg")
  );
}

// Handle SVG response
function handleSVGResponse(iterationIndex, svgContent, requestName) {
  const folderName = `iteration_${iterationIndex + 1}`;
  const fileName = `${requestName.slice(3)}_${iterationIndex + 1}.svg`;

  saveSVGToFolder(folderName, fileName, svgContent);
}

// Handle JSON response
function handleJSONResponse(iterationIndex, responseText) {
  try {
    const response = JSON.parse(responseText);

    if (response.status === "ok") {
      // Only update fields tha exist
      const updatedData = {};

      // Update Nakshatra fields if available
      if (response.data?.nakshatra_details?.nakshatra) {
        const nakshatraDetails = response.data.nakshatra_details.nakshatra;
        updatedData["Nakshatra"] = nakshatraDetails?.name || "Unknown";
        updatedData["Nakshatra Lord"] =
          nakshatraDetails?.lord?.name || "Unknown";
      }

      // Update Yogas field if available
      if (response.data?.yoga_details) {
        const yogaNames = response.data.yoga_details
          .map((yoga) => yoga.name)
          .join(", ");
        updatedData["Yogas"] = yogaNames || "No Yogas Found";
      }

      if (response.data?.has_dosha !== undefined) {
        const kalaSarpDosha = response.data.has_dosha ? "YES" : "NO";

        updatedData["Kala Sarpa Dosha"] = kalaSarpDosha;
      }

      if (response.data?.is_in_sade_sati !== undefined) {
        const sadeSati = response.data.is_in_sade_sati ? "YES" : "NO";
        const phase = response.data.transit_phase ?? "N/A";

        updatedData["Sade Sati (Yes or No)"] = sadeSati;
        updatedData["Phase"] = phase;
      }

      // Update the CSV row with collected updates
      updateCSVRow(iterationIndex, updatedData);
    } else {
      console.warn("Response status is not OK.");
    }
  } catch (error) {
    console.error("Error parsing JSON response:", error.message);
  }
}

// Initialize the output file and run Newman
initializeOutputFile();
runNewman();
