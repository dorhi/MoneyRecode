/**
 * Google Sheets Household Account Book Backend API (v2)
 * 
 * Instructions:
 * 1. Open your Google Sheet.
 * 2. In "Transactions", add a "Category" header (9th column).
 * 3. In "Settings", add a "Category" header (3rd column).
 * 4. Update the script with this version and Re-deploy.
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const TRANSACTIONS_SHEET = "Transactions";
const SETTINGS_SHEET = "Settings";

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const transSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
  const settingsSheet = ss.getSheetByName(SETTINGS_SHEET);
  
  // Get all data
  const transData = transSheet.getDataRange().getValues();
  
  // Filter out truly empty rows (where date or place or amount are missing)
  const validRows = transData.slice(1).filter(row => row[0] !== "" && row[0] !== null);
  
  // Sort by date (descending), then by CreatedAt (descending)
  validRows.sort((a, b) => {
    const d1 = new Date(b[0]) - new Date(a[0]);
    if (d1 !== 0) return d1;
    // Secondary sort: CreatedAt (Registration date - col 7)
    return new Date(b[7] || 0) - new Date(a[7] || 0);
  });
  
  const transactions = validRows.map(row => {
    let obj = {};
    // Ensure Date is formatted as YYYY-MM-DD string for JS
    let dateVal = row[0];
    if (dateVal instanceof Date) {
      const y = dateVal.getFullYear();
      const m = (dateVal.getMonth() + 1).toString().padStart(2, '0');
      const d = dateVal.getDate().toString().padStart(2, '0');
      dateVal = `${y}-${m}-${d}`;
    }
    
    obj.Date = dateVal;
    obj.Place = row[1];
    obj.Amount = row[2];
    obj.User = row[3];
    obj.Details = row[4];
    obj.Card = row[5];
    obj.Author = row[6];
    obj.CreatedAt = row[7];
    obj.Category = row[8];
    return obj;
  });
  
  // Get dropdown options
  const settingsData = settingsSheet.getDataRange().getValues();
  const cards = [];
  const authors = [];
  const categories = [];
  
  for(let i = 1; i < settingsData.length; i++) {
    if(settingsData[i][0]) cards.push(String(settingsData[i][0]));
    if(settingsData[i][1]) authors.push(String(settingsData[i][1]));
    if(settingsData[i][2]) categories.push(String(settingsData[i][2]));
  }
  
  const result = {
    transactions: transactions,
    options: {
      cards: [...new Set(cards)],
      authors: [...new Set(authors)],
      categories: [...new Set(categories)]
    }
  };
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const transSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
    const settingsSheet = ss.getSheetByName(SETTINGS_SHEET);
    
    // 1. Handle Multi-User Splitting
    const userList = data.user.split(',').map(u => u.trim()).filter(u => u !== "");
    const totalAmount = Number(data.amount) || 0;
    const count = userList.length || 1;
    
    const amountPerUser = Math.floor(totalAmount / count);
    const remainder = totalAmount - (amountPerUser * count);
    
    // 2. Add Transactions for each user
    userList.forEach((user, index) => {
      const finalAmount = (index === 0) ? (amountPerUser + remainder) : amountPerUser;
      
      const row = [
        data.date,             // Date
        data.place,            // Place
        finalAmount,           // Amount (Split)
        user,                  // User
        data.details,          // Details
        data.card,             // Card
        data.author,           // Author (Automatically sent from client)
        new Date().toISOString(), // CreatedAt
        data.category          // Category (9th column)
      ];
      transSheet.appendRow(row);
    });
    
    // 3. Update Settings (Auto-add new Card/Category/Author)
    const settingsData = settingsSheet.getDataRange().getValues();
    let cards = settingsData.map(r => r[0]).slice(1).filter(v => v);
    let authors = settingsData.map(r => r[1]).slice(1).filter(v => v);
    let categories = settingsData.map(r => r[2]).slice(1).filter(v => v);
    
    let updatedNeeded = false;
    
    if(!cards.includes(data.card) && data.card) { cards.push(data.card); updatedNeeded = true; }
    if(!authors.includes(data.author) && data.author) { authors.push(data.author); updatedNeeded = true; }
    if(!categories.includes(data.category) && data.category) { categories.push(data.category); updatedNeeded = true; }
    
    if(updatedNeeded) {
      settingsSheet.getRange(2, 1, 1000, 3).clearContent();
      const newSettingsRows = [];
      const maxRows = Math.max(cards.length, authors.length, categories.length);
      for(let i = 0; i < maxRows; i++) {
        newSettingsRows.push([cards[i] || "", authors[i] || "", categories[i] || ""]);
      }
      if(newSettingsRows.length > 0) {
        settingsSheet.getRange(2, 1, newSettingsRows.length, 3).setValues(newSettingsRows);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Recorded successfully"}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
