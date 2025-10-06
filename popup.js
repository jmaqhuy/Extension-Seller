document.addEventListener('DOMContentLoaded', function () {
    const saveProductBtn = document.getElementById('saveProductBtn');
    const saveImgBtn = document.getElementById('saveImgBtn');
    const productTypeSelect = document.getElementById('productType');
    const accountIdSelect = document.getElementById('accountId');

    const N8N_URL = 'http://localhost:8081/etsy/products';

    
    const savedProductType = localStorage.getItem('etsyExtensionProductType');
    const savedAccountId = localStorage.getItem('etsyExtensionAccountId');
    if (savedProductType && productTypeSelect) {
        productTypeSelect.value = savedProductType;
    }
    
    if (productTypeSelect) {
        productTypeSelect.addEventListener('change', function() {
            localStorage.setItem('etsyExtensionProductType', productTypeSelect.value);
        });
    }

    if (savedAccountId && accountIdSelect) {
        accountIdSelect.value = savedAccountId;
    }
    // Save account ID on change
    if (accountIdSelect) {
        accountIdSelect.addEventListener('change', function() {
            localStorage.setItem('etsyExtensionAccountId', accountIdSelect.value);
        });
    }

    /**
     * Show and hide status messages
     * @param {string} message - The message to display
     * @param {string} type - The type of message (info, success, error)
     * @param {number} duration - How long to show the message (default 3000ms)
     * @returns {void}
     */

    let statusTimeoutId = null;

    function showStatus(message, type = 'info', duration = 3000) {
        const statusEl = document.getElementById('status');
        var timeout = 0;

        if (statusTimeoutId) {
            clearTimeout(statusTimeoutId);
            statusTimeoutId = null;
            timeout = 300;
        }

        hideStatus();

        setTimeout(() => {
            statusEl.className = 'status';
            statusEl.innerHTML = message;

            statusEl.classList.add(type);

            statusEl.classList.add('show');

            statusTimeoutId = setTimeout(() => {
                hideStatus();
                statusTimeoutId = null;
            }, duration);
        }, timeout);
    }

    function hideStatus() {
        const statusEl = document.getElementById('status');
        statusEl.classList.remove('show');
    }

    function extractProductData() {
        return new Promise((resolve) => {
            showStatus('<span class="loading"></span>Đang trích xuất dữ liệu sản phẩm...', 'info');

            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                let currentUrl = tabs[0].url.split("?")[0];
                if (!currentUrl?.startsWith("https://www.etsy.com/listing/")) {
                    showStatus('❌ Bạn cần phải vào trang sản phẩm của Etsy', 'error');
                    resolve(null);
                    return;
                }

                chrome.tabs.sendMessage(tabs[0].id, { action: "extractProductData" }, function (response) {
                    if (chrome.runtime.lastError) {
                        showStatus('❌ Vui lòng đợi web tải xong hoặc thử tải lại trang', 'error');
                        resolve(null);
                        return;
                    }

                    if (response && response.success && response.data) {
                        showStatus('✅ Đã trích xuất thành công dữ liệu sản phẩm!', 'success');
                        resolve(response.data);
                    } else {
                        showStatus('❌ Không tìm thấy dữ liệu sản phẩm JSON-LD', 'error');
                        resolve(null);
                    }
                });
            });
        });
    }

    async function pushDataToServer(){
        console.log('pushDataToGoogleSheets called');
        let result = await extractProductData();
        result.productType = productTypeSelect.value; // Add product type to the result
        result.acc = accountIdSelect.value; // Add account ID to the result
        if (!result) return;
        console.log('Extracted product data:', result);
        setButtonLoading(saveProductBtn, true);
        showStatus('<span class="loading"></span>Đang gửi dữ liệu lên Google Sheets...', 'info');

        try {
            const response = await fetch(N8N_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(result)
            });

            const resData = await response.json();
            if (response.ok) {
                showStatus(`✅ ${resData.message || 'Đã gửi dữ liệu thành công!'}`, 'success', 4000);
            } else {
                showStatus(`❌ ${resData.message || 'Có lỗi xảy ra!'}` , 'error');
                return;
            }
        } catch (error) {
            console.error('Error:', error);
            showStatus(`❌ Lỗi khi gửi dữ liệu: ${error.message}`, 'error');
        } finally {
            setButtonLoading(saveProductBtn, false);
        }
    }

    function extractImages() {
        return new Promise((resolve) => {
            showStatus('<span class="loading"></span>Đang trích xuất ảnh sản phẩm...', 'info');

            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                let currentUrl = tabs[0].url.split("?")[0];
                if (!currentUrl?.startsWith("https://www.etsy.com/listing/")) {
                    showStatus('❌ Bạn cần phải vào trang sản phẩm của Etsy', 'error');
                    resolve(null);
                    return;
                }

                chrome.tabs.sendMessage(tabs[0].id, { action: "extractImages" }, function (response) {
                    if (chrome.runtime.lastError) {
                        showStatus('❌ Không thể truy cập trang web', 'error');
                        resolve(null);
                        return;
                    }

                    if (response && response.success && response.data) {
                        showStatus('✅ Đã trích xuất thành công ảnh sản phẩm!', 'success');
                        resolve(response.data);
                    } else {
                        showStatus('❌ Không tìm thấy ảnh sản phẩm', 'error');
                        resolve(null);
                    }
                });
            });
        });
    }

    async function saveAllImages() {
        const data = await extractImages();
        if (!data) return;

        if (data.imagesUrls.length === 0) {
            showStatus('❌ Không có ảnh nào để tải!', 'error');
            return;
        }

        setButtonLoading(saveImgBtn, true);
        showStatus(`<span class="loading"></span>Đang tải ${data.imagesUrls.length} ảnh...`, 'info');

        const productName = data.sku || 'Product';
        const folderName = `${sanitizeFileName(productName)}`;

        let downloadedCount = 0;
        let failedCount = 0;

        data.imagesUrls.forEach((imageUrl, index) => {
            const urlParts = imageUrl.split('.');
            const extension = urlParts[urlParts.length - 1].split('?')[0] || 'jpg';
            const fileName = `ETSY_IMAGES/${folderName}/image_${index + 1}.${extension}`;

            chrome.downloads.download({
                url: imageUrl,
                filename: fileName,
                conflictAction: 'uniquify'
            }, function (downloadId) {
                if (chrome.runtime.lastError) {
                    console.error('Download error:', chrome.runtime.lastError);
                    failedCount++;
                } else {
                    downloadedCount++;
                }

                // Use data.imagesUrls instead of imageUrls for correct length
                if (downloadedCount + failedCount === data.imagesUrls.length) {
                    setButtonLoading(saveImgBtn, false);

                    if (failedCount === 0) {
                        showStatus(`🖼️ Đã tải thành công ${downloadedCount} ảnh!`, 'success', 4000);
                    } else {
                        showStatus(`⚠️ Đã tải ${downloadedCount} ảnh, ${failedCount} ảnh lỗi`, 'warning', 4000);
                    }
                }
            });
        });
    }

    // Utility Functions
    function sanitizeFileName(filename) {
        return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
    }

    function setButtonLoading(button, loading) {
        if (loading) {
            button.disabled = true;
            const originalText = button.innerHTML;
            button.setAttribute('data-original-text', originalText);
            button.innerHTML = '<span class="loading"></span> Loading...';
        } else {
            button.disabled = false;
            const originalText = button.getAttribute('data-original-text');
            if (originalText) {
                button.innerHTML = originalText;
            }
        }
    }

    saveProductBtn.addEventListener('click', pushDataToServer);
    saveImgBtn.addEventListener('click', saveAllImages);

});
