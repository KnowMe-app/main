import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { OrangeBtn, StyledLabel, HiddenInput,  } from './styles';

const ExcelToJson = () => {
    const [jsonData, setJsonData] = useState({});

    // const generateUniqueId = () => {
    //     const randomNumbers = Math.floor(100000 + Math.random() * 900000).toString();
    //     const randomLetters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    //     return `AA1${randomLetters}${randomNumbers}`;
    // };

    const formatJson = (rows, worksheet) => {
        const formatDate = (excelDate, format) => {
            try {
                if (!excelDate) return null;
    
                const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
                if (isNaN(jsDate.getTime())) {
                    return excelDate; // Повертаємо вихідне значення, якщо дата не валідна
                }
    
                const dd = String(jsDate.getDate()).padStart(2, '0');
                const mm = String(jsDate.getMonth() + 1).padStart(2, '0');
                const yyyy = jsDate.getFullYear();
    
                return format === 'dd.mm.yyyy'
                    ? `${dd}.${mm}.${yyyy}`
                    : `${yyyy}-${mm}-${dd}`;
            } catch (error) {
                return excelDate; // Повертаємо вихідне значення у разі помилки
            }
        };
    
const processPhones = (phones) => {
    const formattedPhones = phones
        .filter((phone) => phone !== null && phone !== "")
        .map((phone) => {
            if (typeof phone === "string" && phone.startsWith("(0")) {
                return `38${phone.replace(/[()]/g, '')}`;
            }
            return phone;
        });
    return formattedPhones.length > 1
        ? formattedPhones
        : formattedPhones[0]
        ? formattedPhones[0]
        : null;
};

    
        const processLinks = (link1, link2, link3) => {
            const links = [link1, link2, link3].filter((l) => l !== null && l !== "");
            return links.length > 1 ? { otherLink: links } : links[0] ? { otherLink: links[0] } : null;
        };

        const vkLinks = (link1, link2) => {
            const links = [link1, link2].filter((l) => l !== null && l !== "");
            return links.length > 1 ? { vk: links } : links[0] ? { vk: links[0] } : null;
        };

        const fbLinks = (link1, link2) => {
            const links = [link1, link2].filter((l) => l !== null && l !== "");
            return links.length > 1 ? { facebook: links } : links[0] ? { facebook: links[0] } : null;
        };

        const telegramLinks = (link1, link2) => {
            const links = [link1, link2].filter((l) => l !== null && l !== "");
            return links.length > 1 ? { telegram: links } : links[0] ? { telegram: links[0] } : null;
        };
        const emailLinks = (link1, link2) => {
            const links = [link1, link2].filter((l) => l !== null && l !== "");
            return links.length > 1 ? { email: links } : links[0] ? { email: links[0] } : null;
        };

        const instLinks = (link1, link2) => {
            const links = [link1, link2].filter((l) => l !== null && l !== "");
            return links.length > 1 ? { instagram: links } : links[0] ? { instagram: links[0] } : null;
        };
    
        const processComments = (comment1, comment2, comment3, notes) => {
            const comments = [comment1, comment2, comment3].filter((c) => c !== null).map((comment, index) => {
                if (index === 2) {
                    return formatDate(comment, 'dd.mm.yyyy');
                }
                return comment;
            });
            if (notes) {
                comments.push(notes); // Додаємо примітки до коментарів
            }
            return comments.length ? { myComment: comments.join('; ') } : null;
        };
    
        return rows.reduce((acc, row, rowIndex) => {
            const {
                nameFull, // розібрав
                phone1,
                phone2,
                phone3,
                phone4,
                telegram1,
                telegram2,
                vk1,
                vk2,
                vkMain, // розібрав
                facebookMain, // розібрав
                facebook1,
                facebook2,
                instagramMain,
                instagram1,
                instagram2,
                email1,
                email2,
                emailMain, // розібрав
                otherLink1,
                otherLink2,
                otherLink3,
                otherLink4, // розібрав
                myComment1,
                myComment2,
                myComment3,
                birth,
                lastAction,
                getInTouch,
                Вік, // розібрав
                ІМТ, // розібрав
                csection,
                userId,
                ...rest
            } = row;
    
            // const uniqueId = generateUniqueId();
    
        // Отримуємо примітки для цього рядка
        const notes = [];
        Object.keys(row).forEach((key, colIndex) => {
            // Вираховуємо правильний номер рядка
            const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
            const cell = worksheet[cellAddress];
            if (cell && cell.c) {
                notes.push(...cell.c.map((comment) => comment.t));
            }
        });
    
        acc[userId] = {
            ...Object.fromEntries(
                Object.entries(rest).filter(([key, value]) => value !== null && value !== "")
            ),
            ...(processPhones([phone1, phone2, phone3, phone4]) ? { phone: processPhones([phone1, phone2, phone3, phone4]) } : {}),
            ...(processLinks(otherLink1, otherLink2, otherLink3) || {}),
            ...(vkLinks(vk1, vk2) || {}),
            ...(fbLinks(facebook1, facebook2) || {}),
            ...(telegramLinks(telegram1, telegram2) || {}),
            ...(emailLinks(email1, email2) || {}),
            ...(instLinks(instagram1, instagram2) || {}),
            ...(processComments(myComment1, myComment2, myComment3, notes.join('; ')) || {}),
            ...(birth ? { birth: formatDate(birth, 'dd.mm.yyyy') } : {}),
            ...(lastAction ? { lastAction: formatDate(lastAction, 'dd.mm.yyyy') } : {}),
            ...(getInTouch ? { getInTouch: formatDate(getInTouch, 'yyyy-mm-dd') } : {}),
            ...(csection ? { csection: formatDate(csection, 'dd.mm.yyyy') } : {}),
            ...{userId},
        };
    
            return acc;
        }, {});
    };
    

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
    
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    
                const formattedData = formatJson(rows, worksheet);
                setJsonData(formattedData);
            };
            reader.readAsArrayBuffer(file);
        }
    };
    

    const downloadJson = () => {
        const jsonString = JSON.stringify(jsonData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'structured_data.json';
        link.click();

        URL.revokeObjectURL(url);
    };

    return (
        <div>
        <StyledLabel>
        <HiddenInput type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />
        Up
      </StyledLabel>
        <OrangeBtn onClick={downloadJson} disabled={Object.keys(jsonData).length === 0}>
          ↓ {/* Іконка для завантаження JSON */}
        </OrangeBtn>
        {Object.keys(jsonData).length > 0 && (
          <pre style={{ color: 'black' }}>{JSON.stringify(jsonData, null, 2)}</pre>
        )}
      </div>
    );
};

export default ExcelToJson;
