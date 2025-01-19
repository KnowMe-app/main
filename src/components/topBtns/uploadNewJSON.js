import { HiddenInput, StyledLabel } from "components/styles";
import React, { useState } from "react";

export const UploadJson = () => {
  const [jsonData, setJsonData] = useState(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsedJson = JSON.parse(e.target.result);
          const filteredData = Object.fromEntries(
            Object.entries(parsedJson).filter(([, value]) => {
              const requiredKeys = ["phone", "email", "skype", "facebook", "instagram"];
              return requiredKeys.some((key) => key in value) && !("inline_bot_buttons" in value);
            }).map(([key, value]) => {
              if (value.phone) {
                if (Array.isArray(value.phone)) {
                  value.phone = value.phone.map((num) => processPhoneNumber(num));
                } else {
                  value.phone = processPhoneNumber(value.phone);
                }
              }

              if (value.instagram && typeof value.instagram === "string") {
                value.instagram = value.instagram.replace(/@/g, "");
              }

              return [key, value];
            })
          );
          setJsonData(filteredData);
        } catch (error) {
          alert("Помилка: Файл не є валідним JSON.");
        }
      };
      reader.readAsText(file);
    }
  };

  const processPhoneNumber = (phone) => {
    const processSinglePhone = (singlePhone) => {
      let cleanedPhone = singlePhone.replace(/\+/g, "");
      if (cleanedPhone.startsWith("0")) {
        cleanedPhone = "38" + cleanedPhone;
      }
      return cleanedPhone;
    };
  
    if (Array.isArray(phone)) {
      return phone.map(processSinglePhone);
    } else {
      return processSinglePhone(phone);
    }
  };

  return (
    <div>
      <StyledLabel>
        <HiddenInput type="file" accept=".json" onChange={handleFileUpload} />
        JSON
      </StyledLabel>

      {jsonData && (
        <pre style={{ color: "black" }}>
          {JSON.stringify(jsonData, null, 2)}
        </pre>
      )}
    </div>
  );
};
