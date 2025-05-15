export class JsonFileHandler {
    // Method for downloading a JSON file with save-as dialogue
    static downloadJson(jsonData, filename = "data.json") {
        const jsonString = JSON.stringify(jsonData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Method for opening a JSON file and returning it as an object
    static openJsonFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "application/json";
            input.addEventListener("change", (event) => {
                const file = event.target.files[0];
                if (!file) {
                    reject("No file selected.");
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const jsonData = JSON.parse(reader.result);
                        resolve(jsonData);
                    } catch (error) {
                        reject("Error parsing JSON-file.");
                    }
                };
                reader.onerror = () => reject("Error reading file.");
                reader.readAsText(file);
            });
            input.click();
        });
    }
}
