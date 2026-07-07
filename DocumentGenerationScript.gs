/**
 * Google Apps Script - Document Generation Web App
 * 
 * This script handles POST requests from the Personal Jobs Assistant Chrome Extension.
 * It parses the payload, creates a Google Doc in your Drive (under the root or a template folder),
 * formats the content, and returns the document URL.
 */

function doPost(e) {
  try {
    // 1. Parse the incoming JSON payload
    var payload = JSON.parse(e.postData.contents);
    var type = payload.type;
    var docName = payload.docName || "Untitled_Document";
    var data = payload.resumeData;
    
    // 2. Create a new Google Document
    var doc = DocumentApp.create(docName);
    var body = doc.getBody();
    
    // Reset margins (0.5 inch / 36 points for standard resumes)
    body.setMarginTop(36);
    body.setMarginBottom(36);
    body.setMarginLeft(36);
    body.setMarginRight(36);
    
    if (type === "coverLetter") {
      // --- COVER LETTER GENERATION ---
      body.appendParagraph(data).setFontFamily("Arial").setFontSize(11);
      
    } else if (type === "resume") {
      // --- RESUME GENERATION (Structured JSON) ---
      
      // A. Title (Header)
      if (data.title) {
        var titlePara = body.appendParagraph(data.title);
        titlePara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        titlePara.setFontFamily("Arial").setFontSize(16).setBold(true);
      }
      
      // B. Subtitle (Contact info/Links)
      if (data.subtitle && data.subtitle.length > 0) {
        for (var i = 0; i < data.subtitle.length; i++) {
          var subPara = body.appendParagraph(data.subtitle[i]);
          subPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          subPara.setFontFamily("Arial").setFontSize(10).setItalic(true);
        }
      }
      
      // Spacer
      body.appendParagraph("").setFontSize(6);
      
      // C. Sections
      if (data.sections && data.sections.length > 0) {
        for (var j = 0; j < data.sections.length; j++) {
          var section = data.sections[j];
          
          // 1. Section Title (with bottom border style representation)
          if (section.title) {
            var sectHeader = body.appendParagraph(section.title.toUpperCase());
            sectHeader.setFontFamily("Arial").setFontSize(11).setBold(true);
            sectHeader.setSpacingBefore(12);
            sectHeader.setSpacingAfter(4);
          }
          
          // 2. Section Content (by type)
          if (section.type === "summary") {
            body.appendParagraph(section.content)
                .setFontFamily("Arial")
                .setFontSize(10)
                .setBold(false);
                
          } else if (section.type === "bullet-points") {
            // Can be array of strings or array of objects with labelName
            if (Array.isArray(section.content)) {
              for (var k = 0; k < section.content.length; k++) {
                var item = section.content[k];
                if (typeof item === 'object' && item.labelName) {
                  var p = body.appendListItem(item.content);
                  p.setFontFamily("Arial").setFontSize(10).setBold(false);
                  // Bold the labelName prefix if exists
                  var textEl = p.editAsText();
                  var prefix = item.labelName + " ";
                  textEl.insertText(0, prefix);
                  textEl.setBold(0, prefix.length - 1, true);
                } else {
                  body.appendListItem(item.toString())
                      .setFontFamily("Arial")
                      .setFontSize(10);
                }
              }
            } else if (typeof section.content === 'string') {
              body.appendParagraph(section.content).setFontFamily("Arial").setFontSize(10);
            }
            
          } else if (section.type === "sub-section" && Array.isArray(section.content)) {
            for (var m = 0; m < section.content.length; m++) {
              var subSec = section.content[m];
              
              // Title lines (e.g. Job Title | Date, Company | Location)
              if (subSec.title && Array.isArray(subSec.title)) {
                for (var t = 0; t < subSec.title.length; t++) {
                  var linePara = body.appendParagraph(subSec.title[t]);
                  linePara.setFontFamily("Arial").setFontSize(10).setBold(true);
                  if (t > 0) linePara.setBold(false).setItalic(true);
                }
              }
              
              // Bullet points for this sub-section
              if (subSec.content && Array.isArray(subSec.content)) {
                for (var b = 0; b < subSec.content.length; b++) {
                  body.appendListItem(subSec.content[b])
                      .setFontFamily("Arial")
                      .setFontSize(10)
                      .setBold(false);
                }
              }
            }
          }
        }
      }
    } else {
      throw new Error("Unsupported document type: " + type);
    }
    
    // Save and close
    doc.saveAndClose();
    
    // Return success response with document URL
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      url: doc.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // Return error response
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
