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
            if (typeof phone === "string") {
                // Видаляємо + на початку, якщо він є
                phone = phone.startsWith("+") ? phone.slice(1) : phone;

                // Додаємо 38, якщо телефон починається на (0
                if (phone.startsWith("(0")) {
                    return `38${phone.replace(/[()]/g, '')}`;
                }
            }
            return phone;
        });
    
    return formattedPhones.length > 1
        ? formattedPhones
        : formattedPhones[0]
        ? formattedPhones[0]
        : null;
};

    
        // const processLinks = (link1, link2, link3) => {
        //     const links = [link1, link2, link3].filter((l) => l !== null && l !== "");
        //     return links.length > 1 ? { otherLink: links } : links[0] ? { otherLink: links[0] } : null;
        // };

        // const vkLinks = (link1, link2) => {
        //     const links = [link1, link2].filter((l) => l !== null && l !== "");
        //     return links.length > 1 ? { vk: links } : links[0] ? { vk: links[0] } : null;
        // };

        // const fbLinks = (link1, link2) => {
        //     const links = [link1, link2].filter((l) => l !== null && l !== "");
        //     return links.length > 1 ? { facebook: links } : links[0] ? { facebook: links[0] } : null;
        // };

        // const telegramLinks = (link1, link2) => {
        //     // const links = [link1, link2].filter((l) => l !== null && l !== "");
        //     // return links.length > 1 ? { telegram: links } : links[0] ? { telegram: links[0] } : null;
        //     const links = [link1, link2].filter((l) => l !== null && l !== "" && l !== undefined);

        //     if (links.length === 0) {
        //         return null; // Нічого не повертати, якщо масив порожній
        //     }
        //     if (links.length === 1) {
        //         return { telegram: links[0] }; // Повертає одне значення як ключ-значення
        //     }
        //     return { telegram: links }; // Повертає масив, якщо більше одного значення
        // };
        
        const makeLink = (key, ...links) => {
            const validLinks = links.filter((l) => l !== null && l !== "" && l !== undefined);
        
            if (validLinks.length === 0) {
                return null; // Якщо немає жодного валідного значення, не повертати ключ
            }
        
               // Спеціальна обробка для VK
    if (key === 'vk') {
        const vkIds = validLinks.map(link => {
            const match = link.match(/vk\.com\/(id\d+|[a-zA-Z0-9_]+)/);
            return match ? match[1] : link; // Повертаємо ID або залишаємо посилання, якщо ID не знайдено
        });
        return vkIds.length === 1 ? { [key]: vkIds[0] } : { [key]: vkIds };
    }

    // Стандартна обробка
    return validLinks.length === 1
        ? { [key]: validLinks[0] } // Якщо одне значення, повернути як ключ-значення
        : { [key]: validLinks }; // Якщо кілька значень, повернути як масив
        
        };

        const cleanBilingualFields = (obj, keys) => {
            if (!obj || typeof obj !== 'object') return {}; // Перевірка, чи об'єкт існує
        
            return Object.fromEntries(
                Object.entries(obj).map(([key, value]) => {
                    if (keys.includes(key) && typeof value === 'string' && value.includes('/')) {
                        return [key, value.split('/')[0].trim()];
                    }
                    return [key, value];
                })
            );
        };

        // const emailLinks = (link1, link2) => {
        //     const links = [link1, link2].filter((l) => l !== null && l !== "");
        //     return links.length > 1 ? { email: links } : links[0] ? { email: links[0] } : null;
        // };

        // const instLinks = (link1, link2) => {
        //     const links = [link1, link2].filter((l) => l !== null && l !== "");
        //     return links.length > 1 ? { instagram: links } : links[0] ? { instagram: links[0] } : null;
        // };
    
        const processComments = (comment1, comment2, comment3, notes) => {
            const comments = [comment1, comment2, comment3]
            .filter((c) => c !== null && c !== "") // Видаляємо null та порожні коментарі
            .map((comment, index) => {
                if (index === 0) {
                    return `Характер: ${comment}`; // Додаємо "Характер:" перед першим коментарем
                }
                if (index === 2) {
                    return formatDate(comment, 'dd.mm.yyyy'); // Форматуємо третій коментар як дату
                }
                return comment; // Інші коментарі залишаємо без змін
            });
    
        if (notes) {
            comments.push(notes); // Додаємо примітки до коментарів
        }
    
        return comments.length ? { myComment: comments.join('; ') } : null;
    };
    
        return rows.reduce((acc, row, rowIndex) => {
            const {
                
                phone1,
                phone2,
                phone3,
                phone4,
                phone5,
                telegram1,
                telegram2,
                photos,
                vk1,
                vk2,
                vk3, 
                vk4,
               
                facebook1,
                facebook2,
                instagramMain,
                instagram1,
                instagram2,
                email1,
                email2,
                
                otherLink1,
                otherLink2,
                otherLink3,
                otherLink4, // розібрав
                myComment1,
                myComment2,
                myComment3,
                birth,
                lastAction,
                lastDelivery,
                getInTouch,
                
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

        const convertDriveLinkToImage = (link) => {
            if (typeof link !== 'string') {
                return null; // Якщо посилання не є рядком, повертаємо null
            }
        
            let fileId = null;
        
            // Перевірка формату "file/d/"
            const fileMatch = link.match(/\/file\/d\/([^/]+)/);
            if (fileMatch) {
                fileId = fileMatch[1];
            }
        
            // Перевірка формату "open?id="
            const openMatch = link.match(/open\?id=([^&]+)/);
            if (openMatch) {
                fileId = openMatch[1];
            }
        
            return fileId ? `https://drive.google.com/uc?id=${fileId}` : null;
        
        
        };

        const excludedFields = [
            'no1', 'no2', 'no3', 'no4', 'no5', 'no6', 'no7',
            'nameFull', 'facebookMain',
                'consentForDataProcessing',
                'tendencyToCorpulence',
                'Вік', // розібрав
                'ІМТ', // розібрав
                'emailMain', // розібрав
                'vkMain', // розібрав
                'formRemarks',
        ];

        const bilingualKeys = ['race', 'hairColor', 'hairStructure', 'eyeColor', 'bodyType', 'education'];
    
        acc[userId] = {
            ...Object.fromEntries(
                Object.entries(rest)
                    .filter(([key, value]) => 
                        value !== null && value !== "" && !excludedFields.includes(key)
                    )
            ),
            ...(processPhones([phone1, phone2, phone3, phone4, phone5]) ? { phone: processPhones([phone1, phone2, phone3, phone4, phone5]) } : {}),
            // ...Object.fromEntries(
            //     Object.entries(linkConfig)
            //         .map(([key, links]) => makeLink(key, links)) // Проходимося по кожному ключу
            //         .filter((entry) => entry !== null) // Видаляємо null, якщо посилань немає
            // ),
            ...(cleanBilingualFields(
                row && typeof row === 'object'
                    ? Object.fromEntries(
                        Object.entries(row).filter(([key]) => bilingualKeys.includes(key))
                    )
                    : {}, // Порожній об'єкт, якщо row не є об'єктом
                bilingualKeys
            ) || {}),
            ...(makeLink('telegram', telegram1, telegram2) || {}),
            ...(makeLink('facebook', facebook1, facebook2) || {}),
            ...(makeLink('instagram', instagram1, instagram2) || {}),
            ...(makeLink('vk', vk1, vk2, vk3, vk4) || {}),
            ...(makeLink('email', email1, email2) || {}),
            ...(makeLink('otherLink', otherLink1, otherLink2, otherLink3, otherLink4) || {}),
            ...(processComments(myComment1, myComment2, myComment3, notes.join('; ')) || {}),
            ...(birth ? { birth: formatDate(birth, 'dd.mm.yyyy') } : {}),
            ...(lastAction ? { lastAction: formatDate(lastAction, 'dd.mm.yyyy') } : {}),
            ...(lastDelivery ? { lastDelivery: formatDate(lastDelivery, 'dd.mm.yyyy') } : {}),
            ...(getInTouch ? { getInTouch: formatDate(getInTouch, 'yyyy-mm-dd') } : {}),
            ...(csection ? { csection: formatDate(csection, 'dd.mm.yyyy') } : {}),
            ...(photos
                ? {
                    photos: photos
                        .split(',')
                        .filter(photo => photo.trim() !== "") // Видаляємо порожні значення
                        .map(photo => photo.trim()) // Видаляємо зайві пробіли
                        .map(photo => convertDriveLinkToImage(photo)) // Конвертуємо посилання для зображень
                        .filter(photo => photo !== null) // Видаляємо некоректні посилання
                }
                : {}),
            ...{ userId },
        };

        // Видаляємо поля з `null` після всіх об'єднань
        acc[userId] = Object.fromEntries(
            Object.entries(acc[userId]).filter(([key, value]) =>
                value !== null &&
                value !== undefined &&
                value !== "" &&
                !excludedFields.includes(key)
            )
        );
    
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
