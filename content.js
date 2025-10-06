function extractProductData() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    let productData = null;
    scripts.forEach(script => {
        try {
            const jsonData = JSON.parse(script.textContent.trim());
            if (jsonData['@type'] === 'Product') {
                productData = jsonData;
            }
        } catch (e) {
            console.error('Error parsing JSON-LD:', e);
        }
    });
    if (!productData) {
        return null;
    }

    // Get price from DOM structure like pricefield.html
    let domPrice = null;
    try {
        const priceDiv = document.querySelector('div[data-appears-component-name="price"] p');
        if (priceDiv) {
            // Extract price from text, e.g. "$3.00"
            const priceText = priceDiv.textContent.trim();
            const match = priceText.match(/\$([\d,.]+)/);
            if (match) {
                domPrice = match[1].replace(/,/g, '');
            }
        }
    } catch (e) {
        console.error('Error extracting price from DOM:', e);
    }


    // Tìm customization
    const buyBox = document.querySelector('div[data-buy-box]');
    if (!buyBox) {
        console.error('Buy box not found');
        return null;
    }
    const variationsDiv = buyBox.querySelector('div[data-appears-component-name="variations"]');

    let variations = [];
    let personalization = [];

    
    if (variationsDiv) {
        const variationItems = variationsDiv.querySelectorAll('[data-selector="listing-page-variation"]');
        variationItems.forEach(item => {
            const labelSpan = item.querySelector('span[data-label]');
            const select = item.querySelector('select');
            if (labelSpan && select) {
                const label = labelSpan.textContent.trim();
                const options = Array.from(select.options)
                    .map(opt => opt.textContent.trim())
                    .filter(text => text.length > 0)
                    .slice(1); // bỏ option trống nếu có
                variations.push({ label, options });
            }
        });
    }

    const personalizationDiv = buyBox.querySelector('div[data-appears-component-name="personalization"]');
    if (personalizationDiv) {
        const p = personalizationDiv.querySelector('p[data-instructions=""]');
        if (p) {
        // Lấy nội dung HTML, tách theo <br>
        personalization = p.innerHTML
            .split(/<br\s*\/?>/i) // tách theo <br> hoặc <br/>
            .map(line => line.trim()) // bỏ khoảng trắng dư
            .filter(line => line.length > 0); // loại bỏ dòng trống
        }
    }
    

    // Tìm product tags

    let hey_etsy_container = document.querySelector(`div#heyetsy-card-container[data-heyetsy-listing-id="${productData.sku}"]`);
    let a_tags = hey_etsy_container.querySelectorAll('a');
    // Tìm thẻ <a> có nội dung là "Suggestions"
    let suggestion_link = Array.from(a_tags).find(a => 
        a.textContent.trim().toLowerCase() === 'suggestions'
    );

    let href = suggestion_link.getAttribute('href');
    let tags = href.substring(href.indexOf('tags=') + 5).split(',').map(tag => tag.trim());

    
    const extractedData = {
        id: productData.sku || null,
        title: productData.name || null,
        description: productData.description || null,
        price: domPrice || (productData.offers.price ? productData.offers.price : productData.offers.highPrice),
        images: productData.image ? productData.image.map(img => img.contentURL || img.url) : [],
        material: productData.material || null,
        variation: variations.length > 0 ? variations : null,
        personalization: personalization.length > 0 ? personalization : null,
        tags: tags || null
    };
    console.log('✅ Trích xuất dữ liệu thành công:', extractedData);
    return extractedData;
}

function extractAllProductData(settings = {}) {
    const items = document.querySelectorAll('a[data-listing-id]');
    const distinctIds = new Set();
    const idToMainImage = {};

    items.forEach(element => {
        const listingId = element.getAttribute('data-listing-id');
        if (listingId) {
            distinctIds.add(listingId);

            // Find the closest .v2-listing-card__img div within the same card/listing
            let cardImgDiv = null;
            // Try parent, then querySelector
            if (element.parentElement) {
                cardImgDiv = element.parentElement.querySelector('.v2-listing-card__img');
            }
            if (!cardImgDiv) {
                // fallback: search in element itself
                cardImgDiv = element.querySelector('.v2-listing-card__img');
            }
            if (!cardImgDiv) {
                // fallback: search in next siblings
                let sibling = element.nextElementSibling;
                while (sibling) {
                    if (sibling.classList && sibling.classList.contains('v2-listing-card__img')) {
                        cardImgDiv = sibling;
                        break;
                    }
                    sibling = sibling.nextElementSibling;
                }
            }
            if (cardImgDiv) {
                const imgTag = cardImgDiv.querySelector('img');
                if (imgTag && imgTag.src) {
                    idToMainImage[listingId] = imgTag.src;
                }
            }
        }
    });

    if (distinctIds.size === 0) {
        return { success: false, message: 'Không tìm thấy sản phẩm nào', count: 0 };
    }

    const results = [];
    distinctIds.forEach(id => {
        let result = extractHeyEtsyToolData(id, settings);
        if (result.success) {
            // Add sku (is id) to result.data
            result.data.sku = id;
            // Add mainImage if found
            if (idToMainImage[id]) {
                result.data.mainImage = idToMainImage[id];
            }
            results.push(result.data);
        } else {
            console.log(`⚠️ Không tìm thấy heyetsy element cho ID: ${id}`);
        }
    });

    return {
        success: true,
        message: 'Đã trích xuất dữ liệu thành công',
        data: results
    }
}

function extractHeyEtsyToolData(id, settings) {
    let heyetsyElement = document.querySelector(`div[data-heyetsy-listing-id="${id}"]`);

    if (!heyetsyElement) {
        const allHeyetsyElements = document.querySelectorAll('div#heyetsy-card-container');
        for (const element of allHeyetsyElements) {
            const aElements = Array.from(element.querySelectorAll('a'));
            for (const a of aElements) {
                const href = a.getAttribute('href');
                const text = a.textContent.trim();
                const match = href && href.match(/\/listing\/(\d+)\/similar/);
                if (match && match[1] === id && text === '👉 View market products') {
                    heyetsyElement = element;
                    break;
                }
            }
            if (heyetsyElement) break;
        }
    }

    if (heyetsyElement) {
        // Trích xuất dữ liệu từ heyetsy element
        const productData = extractHeyetsyData(heyetsyElement, id);
        
        if (productData) {
            
            // Áp dụng filter theo settings
            const passesFilter = applyFilters(productData, settings);
            
            if (passesFilter) {
                return {
                    success: true,
                    data: productData,
                }
            } else {
                console.log(`❌ ID: ${id} - FILTERED OUT`);
            }
            
            console.log('---');
        }
        
    } else {
        console.log(`⚠️ Không tìm thấy heyetsy element cho ID: ${id}`);
    }
    return {
        success: false,
        data: null,
    };
}

function extractHeyetsyData(heyetsyElement, id) {
    try {
        // Trích xuất sold 24h
        const soldTooltip = Array.from(heyetsyElement.querySelectorAll('.heyetsy-tooltip')).find(el => 
            el.textContent.includes('Sold in the Last 24 Hours'));
        const sold24h = soldTooltip ? 
            soldTooltip.parentElement.querySelector('p').textContent.trim() : 'N/A';
        
        // Trích xuất views 24h
        const viewsTooltip = Array.from(heyetsyElement.querySelectorAll('.heyetsy-tooltip')).find(el => 
            el.textContent.includes('Views in the Last 24 Hours'));
        const views24h = viewsTooltip ? 
            viewsTooltip.parentElement.querySelector('p').textContent.trim() : 'N/A';
        
        // Trích xuất conversion rate
        const conversionTooltip = Array.from(heyetsyElement.querySelectorAll('.heyetsy-tooltip')).find(el => 
            el.textContent.includes('Estimated conversion rate'));
        const conversionRate = conversionTooltip ? 
            conversionTooltip.parentElement.querySelector('p').textContent.trim() : 'N/A';
        
        // Trích xuất tags
        const copyButton = heyetsyElement.querySelector('button[onclick*="navigator.clipboard.writeText"]');
        let tags = 'N/A';
        if (copyButton) {
            const onclickAttr = copyButton.getAttribute('onclick');
            const match = onclickAttr.match(/writeText\('([^']+)'\)/);
            tags = match ? match[1] : 'N/A';
        }

        // Trích xuất thông tin cơ bản của sản phẩm
        const productLink = heyetsyElement.querySelector(`a[href*="/listing/${id}/"]`);
        // Get the product URL from the link, but only up to and including the ID
        let productUrl = 'N/A';
        if (productLink) {
            const href = productLink.href;
            const match = href.match(new RegExp(`/listing/${id}`));
            if (match) {
            // Get substring from start to the end of "/listing/{id}"
            const idx = href.indexOf(`/listing/${id}`) + (`/listing/${id}`).length;
            productUrl = href.substring(0, idx);
            } else {
            productUrl = href;
            }
        }
        

        return {
            id: id,
            url: productUrl,
            sold24h: sold24h,
            views24h: views24h,
            conversionRate: conversionRate,
            tags: tags
        };
    } catch (error) {
        console.error(`❌ Lỗi khi trích xuất dữ liệu cho ID ${id}:`, error);
        return null;
    }
}

function extractImages() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    let productData = null;
    console.log('Extracting images from JSON-LD scripts...');
    

    for (const script of scripts) {
        try {
            const jsonData = JSON.parse(script.textContent.trim());
            if (jsonData['@type'] === 'Product') {
                productData = jsonData;
                break; // Stop the loop
            }
        } catch (e) {
            console.error('Error parsing JSON-LD:', e);
        }
    }
    
    const contentUrls = productData.image
        .map(img => img.contentURL)
        .filter(url => url); // This removes any undefined/null values

    const extractedImage = {
        sku: productData.sku || '',
        imagesUrls: contentUrls
    }
    
    return extractedImage;
    
}

function applyFilters(productData, settings) {
    if (!settings.minConversionRate && !settings.minViews24h && !settings.minSold24h) {
        return true; // Không có filter nào được set
    }
    
    let passesConversionFilter = true;
    let passesViewsFilter = true;
    let passesSoldFilter = true; // Add this line
    
    // Filter theo conversion rate
    if (settings.minConversionRate && settings.minConversionRate >= 0) {
        const conversionText = productData.conversionRate;
        if (conversionText && conversionText !== 'N/A') {
            const conversionMatch = conversionText.match(/(\d+\.?\d*)%/);
            if (conversionMatch) {
                const conversionValue = parseFloat(conversionMatch[1]);
                passesConversionFilter = conversionValue >= settings.minConversionRate;
            } else {
                passesConversionFilter = false; // Không parse được thì loại bỏ
            }
        } else {
            passesConversionFilter = false; // Không có dữ liệu thì loại bỏ
        }
    }
    
    // Filter theo views 24h
    if (settings.minViews24h && settings.minViews24h >= 0) {
        const viewsText = productData.views24h;
        if (viewsText && viewsText !== 'N/A') {
            // Xử lý các format như "1,234", "1.2K", "1.5M"
            const viewsValue = parseNumberWithSuffix(viewsText);
            passesViewsFilter = viewsValue >= settings.minViews24h;
        } else {
            passesViewsFilter = false; // Không có dữ liệu thì loại bỏ
        }
    }
    
    // Filter theo sold 24h
    if (settings.minSold24h && settings.minSold24h >= 0) {
        const soldText = productData.sold24h;
        if (soldText && soldText !== 'N/A') {
            // Xử lý các format như "2+", "10+ Sold"
            const soldValueMatch = soldText.match(/(\d+)/);
            const soldValue = soldValueMatch ? parseInt(soldValueMatch[1]) : 0;
            passesSoldFilter = soldValue >= settings.minSold24h;
        } else {
            passesSoldFilter = false;
        }
    }

    return passesConversionFilter && passesViewsFilter && passesSoldFilter;
}

function parseNumberWithSuffix(text) {
    if (!text || text === 'N/A') return 0;
    
    // Loại bỏ dấu phay và khoảng trắng
    const cleanText = text.replace(/[,\s]/g, '');
    
    // Kiểm tra suffix K, M, B
    const match = cleanText.match(/^(\d+\.?\d*)([KMB])?$/i);
    if (match) {
        const number = parseFloat(match[1]);
        const suffix = match[2]?.toLowerCase();
        
        switch (suffix) {
            case 'k': return number * 1000;
            case 'm': return number * 1000000;
            case 'b': return number * 1000000000;
            default: return number;
        }
    }
    
    // Fallback: chỉ parse số thông thường
    const numberMatch = cleanText.match(/(\d+)/);
    return numberMatch ? parseInt(numberMatch[1]) : 0;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Nhận message:', request.action);
    if (request.action === "extractImages") {
        const data = extractImages();
        sendResponse({ success: !!data, data });
    } else if (request.action === "extractProductData") {
        const data = extractProductData();
        sendResponse({ success: !!data, data });
    } else if (request.action === "extractAllProductData") {
        const settings = request.settings || {};
        const data = extractAllProductData(settings);
        sendResponse(data);
    }
    return true; // Only needed if you use async
});

