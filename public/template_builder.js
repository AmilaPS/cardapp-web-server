// =================================================================
// 🎯 DYNAMIC IP & HOST RECOGNITION ENGINE (Railway & Local Dynamic Fix)
// =================================================================
const CURRENT_HOST = window.location.hostname; 
const rawPyPort = window.ENV_PYTHON_PORT || 8001;

let API_BASE, BACKEND_STATIC;

// Railway එකෙන් Full Domain URL එකක් ආවොත් (https://...):
if (typeof rawPyPort === 'string' && rawPyPort.startsWith('http')) {
    API_BASE = `${rawPyPort}/api`;
    BACKEND_STATIC = rawPyPort;
} else {
    // Local PC එකේදී Port එකක් පමණක් ආවොත් (උදා: 3001):
    API_BASE = `http://${CURRENT_HOST}:${rawPyPort}/api`;
    BACKEND_STATIC = `http://${CURRENT_HOST}:${rawPyPort}`;
}

console.log(`[Dynamic Linking] Node UI loaded from: ${window.location.origin}`);
console.log(`[Dynamic Linking] Routing Python API requests to: ${API_BASE}`);
// =================================================================

const canvas = document.getElementById('templateCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let backgroundImage = null;
let savedBgName = "none";
let layers = [];
let systemFonts = []; 
let loadedFonts = new Set();
let currentEditCardId = null;
let globalCardsList = [];
let globalCanvasesList = []; 

const ITEMS_PER_PAGE = 10; 

let cardsCurrentPage = 1;
let cardsFilteredList = [];

let canvasesCurrentPage = 1;
let canvasesFilteredList = [];

let fontsCurrentPage = 1;
let fontsFilteredList = [];

let globalSlotsList = [];
let slotsCurrentPage = 1;
let slotsFilteredList = [];

const defaultGridImage = new Image();
defaultGridImage.src = "/public/grid.jpg"; 
defaultGridImage.onload = function() {
    renderCanvas();
};

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    if (window.event && window.event.target) window.event.target.classList.add('active');
    
    if(tabId === 'card_maker_tab') loadCardsList();
    if(tabId === 'image_maker_tab') loadCanvasesList();
    if(tabId === 'fonts_tab') loadFontsList();
    if(tabId === 'hints_tab') {
        loadSlotsList();   // 👈 Slots ලැයිස්තුව Load කරන Function එක එකතු කළා
        loadGlobalHints();
    }
}

function autoGenerateFolderName(val) {
    if(currentEditCardId) return;
    document.getElementById('folder_name').value = val.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_+|_+$)/g, '');
}

function toggleImField(prefix) {
    const isChecked = document.getElementById(`${prefix}_use_im`).checked;
    document.getElementById(`${prefix}_canvas_block`).style.display = isChecked ? 'block' : 'none';
}

function updateBlueprintCanvasDropdowns() {
    let availableCanvases = globalCanvasesList;
    if (currentEditCardId) {
        availableCanvases = globalCanvasesList.filter(c => c.card_id === currentEditCardId);
    }

    const optionsHtml = '<option value="">Select Canvas</option>' + 
        availableCanvases.map(c => `<option value="${c.canvas_id}">${c.canvas_name}</option>`).join('');

    ['design', 'preview', 'cut'].forEach(prefix => {
        const select = document.getElementById(`${prefix}_canvas_id`);
        if (select) {
            const currentVal = select.value;
            select.innerHTML = optionsHtml;
            select.value = currentVal || "";
        }
    });
}

function toggleBlueprintMode(prefix) {
    const isChecked = document.getElementById(`${prefix}_use_im`).checked;
    document.getElementById(`${prefix}_canvas_id`).style.display = isChecked ? 'inline-block' : 'none';
    document.getElementById(`${prefix}_file_container`).style.display = isChecked ? 'none' : 'flex';
}

function previewCardImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgBox = document.getElementById('card_img_preview');
            imgBox.src = e.target.result;
            imgBox.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function addAssetRow(name = "", useIm = false, canvasId = "", savedFileName = "") {
    const wrapper = document.getElementById('assetsWrapper');
    let availableCanvases = globalCanvasesList;
    if (currentEditCardId) {
        availableCanvases = globalCanvasesList.filter(c => c.card_id === currentEditCardId);
    }

    const div = document.createElement('div');
    div.className = 'asset-row-box';
    // 🎯 පරණ file name එක element එකේ attribute එකක් ලෙස තබා ගැනීම:
    div.setAttribute('data-saved-file', savedFileName || 'none');
    div.style.cssText = "background: #f9f9f9; padding: 8px 12px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 5px;";
    
    div.innerHTML = `
        <div style="display: flex; gap: 10px; align-items: center; width: 100%;">
            <input type="text" class="asset_name" value="${name}" placeholder="Req. Name" style="width: 140px; padding: 5px;">
            
            <div class="asset-file-container" style="flex: 1; display: ${useIm ? 'none' : 'flex'}; align-items: center; gap: 8px;">
                <input type="file" class="asset_file" style="font-size: 12px; max-width: 200px;">
                <small class="saved-file-indicator" style="color: #555; font-style: italic; white-space: nowrap;">
                    ${savedFileName && savedFileName !== 'none' ? `📁 දැනට ගබඩා කර ඇති ගොනුව: <b>${savedFileName}</b>` : '📁 නව ගොනුවක් තෝරා නැත'}
                </small>
            </div>

            <label style="display: flex; align-items: center; gap: 5px; font-weight: bold; font-size: 12px; cursor: pointer; white-space: nowrap;">
                <input type="checkbox" class="asset_use_im" ${useIm ? 'checked' : ''} onchange="toggleAssetMode(this)"> Image Maker
            </label>
            
            <select class="asset_canvas_id" style="width: 180px; padding: 5px; display: ${useIm ? 'inline-block' : 'none'};">
                <option value="">Select Canvas</option>
                ${availableCanvases.map(c => `<option value="${c.canvas_id}" ${c.canvas_id === canvasId ? 'selected' : ''}>${c.canvas_name}</option>`).join('')}
            </select>
            
            <button type="button" class="btn-danger" onclick="this.closest('.asset-row-box').remove()" style="padding: 4px 8px;">X</button>
        </div>
    `;
    wrapper.appendChild(div);
}

function toggleAssetMode(chk) {
    const box = chk.closest('.asset-row-box');
    const isChecked = chk.checked;
    box.querySelector('.asset_canvas_id').style.display = isChecked ? 'inline-block' : 'none';
    box.querySelector('.asset-file-container').style.display = isChecked ? 'none' : 'block';
}

function openNewCardEditor() {
    currentEditCardId = null;
    document.getElementById('panelTitle').innerText = "Tuning Card Assets";
    
    document.getElementById('card_id_input').value = "";
    document.getElementById('card_id_input').disabled = false;
    document.getElementById('card_name').value = ""; 
    document.getElementById('card_name').disabled = false;
    
    document.getElementById('card_web_id').value = "";
    document.getElementById('folder_name').value = ""; 
    document.getElementById('keywords').value = ""; 
    document.getElementById('image_slots').value = ""; 
    document.getElementById('text_slots').value = ""; 
    
    const imgPreview = document.getElementById('card_img_preview');
    if (imgPreview) imgPreview.style.display = 'none';
    
    document.getElementById('assetsWrapper').innerHTML = "";
    
    document.getElementById('design_use_im').checked = false; 
    document.getElementById('cut_use_im').checked = false;
    document.getElementById('preview_use_im').checked = false;
    
    toggleBlueprintMode('design'); 
    toggleBlueprintMode('preview');
    toggleBlueprintMode('cut');

    updateBlueprintCanvasDropdowns();

    if (document.getElementById('design_file_indicator')) document.getElementById('design_file_indicator').innerHTML = "";
    if (document.getElementById('preview_file_indicator')) document.getElementById('preview_file_indicator').innerHTML = "";
    if (document.getElementById('cut_file_indicator')) document.getElementById('cut_file_indicator').innerHTML = "";

    document.getElementById('cardEditorSection').style.display = 'block';
}

// =================================================================
// 🚀 UNIVERSAL PAGINATION ENGINE
// =================================================================
function renderPagination(totalItems, currentPage, prefix, onPageChange) {
    const infoElem = document.getElementById(`${prefix}_page_info`);
    const containerElem = document.getElementById(`${prefix}_page_numbers`);
    
    if (!infoElem || !containerElem) return;

    if (totalItems === 0) {
        infoElem.innerText = "Showing 0-0 of 0";
        containerElem.innerHTML = "";
        return;
    }

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);

    infoElem.innerText = `Showing ${startItem}-${endItem} of ${totalItems}`;
    containerElem.innerHTML = "";

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.className = `page-num-btn ${i === currentPage ? "active" : ""}`;
        btn.innerText = i;
        btn.onclick = () => onPageChange(i);
        containerElem.appendChild(btn);
    }
}

async function loadCardsList() {
    await loadFontsList();
    const res = await fetch(`${API_BASE}/cards`);
    globalCardsList = await res.json();
    populateCardDropdown();
    handleCardSearch(false); 
}

function handleCardSearch(resetPage = true) {
    const query = document.getElementById('search_cards').value.toLowerCase().trim();
    if(resetPage) cardsCurrentPage = 1;
    cardsFilteredList = globalCardsList.filter(c => c.card_name.toLowerCase().includes(query) || c.card_id.toLowerCase().includes(query));
    renderCardsTable();
}

function renderCardsTable() {
    const container = document.getElementById('cardsListContainer');
    container.innerHTML = '';
    const totalItems = cardsFilteredList.length;
    
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    if (cardsCurrentPage > totalPages) cardsCurrentPage = totalPages;

    const startIdx = (cardsCurrentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, totalItems);
    const pageItems = cardsFilteredList.slice(startIdx, endIdx);
    
    if(pageItems.length === 0) {
        container.innerHTML = '<div class="item-row"><div class="item-info">ගැලපෙන කිසිදු කාඩ්පතක් සොයාගත නොහැක.</div></div>';
    } else {
        pageItems.forEach(c => {
            container.innerHTML += `
                <div class="item-row">
                    <div class="item-info">${c.card_name} <span>ID: ${c.card_id} | Dir: /image_templates/${c.folder_name}</span></div>
                    <div>
                        <button class="btn-blue" style="background:#00a8ff;" onclick="editExistingCard('${c.card_id}')">Edit Node</button>
                        <button class="btn-danger" onclick="deleteCardNode('${c.card_id}')">Delete Card</button>
                    </div>
                </div>`;
        });
    }

    renderPagination(totalItems, cardsCurrentPage, 'cards', (newPage) => {
        cardsCurrentPage = newPage;
        renderCardsTable();
    });
}

async function editExistingCard(cardId) {
    currentEditCardId = cardId;
    await loadCanvasesList();

    const res = await fetch(`${API_BASE}/cards/${cardId}`);
    const data = await res.json();
    
    document.getElementById('panelTitle').innerText = `Tuning Card Assets: ${data.card.card_name}`;
    document.getElementById('card_id_input').value = data.card.card_id;
    document.getElementById('card_id_input').disabled = true;
    
    document.getElementById('card_web_id').value = data.card.card_web_id || "";
    document.getElementById('card_name').value = data.card.card_name; 
    document.getElementById('card_name').disabled = true;
    document.getElementById('folder_name').value = data.card.folder_name; 
    document.getElementById('api_link').value = data.card.api_link;
    
    document.getElementById('keywords').value = data.card.keywords || "";
    document.getElementById('image_slots').value = data.card.image_slots || "";
    document.getElementById('text_slots').value = data.card.text_slots || "";

    if (data.card.card_image) {
        const imgBox = document.getElementById('card_img_preview');
        if (imgBox) {
            imgBox.src = data.card.card_image;
            imgBox.style.display = 'block';
        }
    } else {
        const imgBox = document.getElementById('card_img_preview');
        if (imgBox) imgBox.style.display = 'none';
    }
    
    updateBlueprintCanvasDropdowns();

    document.getElementById('design_use_im').checked = data.card.design_canvas_id ? true : false;
    document.getElementById('design_canvas_id').value = data.card.design_canvas_id || "";
    toggleBlueprintMode('design');
    
    document.getElementById('preview_use_im').checked = data.card.preview_canvas_id ? true : false;
    document.getElementById('preview_canvas_id').value = data.card.preview_canvas_id || "";
    toggleBlueprintMode('preview');

    document.getElementById('cut_use_im').checked = data.card.cut_crease_canvas_id ? true : false;
    document.getElementById('cut_canvas_id').value = data.card.cut_crease_canvas_id || "";
    toggleBlueprintMode('cut');

    const designInd = document.getElementById('design_file_indicator');
    if (designInd) {
        const dFile = data.card.saved_design_file;
        designInd.innerHTML = (dFile && dFile !== 'none') ? `📁 දැනට ගබඩා කර ඇති ගොනුව: <b>${dFile}</b>` : "📁 නව ගොනුවක් තෝරා නැත";
    }

    const previewInd = document.getElementById('preview_file_indicator');
    if (previewInd) {
        const pFile = data.card.saved_preview_file;
        previewInd.innerHTML = (pFile && pFile !== 'none') ? `📁 දැනට ගබඩා කර ඇති ගොනුව: <b>${pFile}</b>` : "📁 නව ගොනුවක් තෝරා නැත";
    }

    const cutInd = document.getElementById('cut_file_indicator');
    if (cutInd) {
        const cFile = data.card.saved_cut_file;
        cutInd.innerHTML = (cFile && cFile !== 'none') ? `📁 දැනට ගබඩා කර ඇති ගොනුව: <b>${cFile}</b>` : "📁 නව ගොනුවක් තෝරා නැත";
    }
    
    document.getElementById('assetsWrapper').innerHTML = "";
    if (data.assets && data.assets.length > 0) {
        data.assets.forEach(a => { 
            addAssetRow(a.asset_name, a.use_image_maker == 1, a.canvas_id || "", a.file_name || ""); 
        });
    }
    
    document.getElementById('cardEditorSection').style.display = 'block';
    document.getElementById('btnTestGeneration').style.display = 'inline-block';
    document.getElementById('btnCreatePDF').style.display = 'inline-block';
}

async function submitCardToBackend() {
    try {
        const cardIdCustom = document.getElementById('card_id_input').value.trim();
        const cardWebId = document.getElementById('card_web_id').value.trim();
        const cardName = document.getElementById('card_name').value;
        const folderName = document.getElementById('folder_name').value;
        const apiLink = document.getElementById('api_link').value; 
        
        const formData = new FormData();
        formData.append("card_web_id", cardWebId);
        formData.append("keywords", document.getElementById('keywords').value);
        formData.append("image_slots", document.getElementById('image_slots').value);
        const textSlotsVal = document.getElementById('text_slots').value.trim();
        formData.append("text_slots", textSlotsVal);
        formData.append("api_link", apiLink); 

        const cardImgFile = document.getElementById('card_image_file');
        if (cardImgFile && cardImgFile.files[0]) {
            formData.append("card_image_file", cardImgFile.files[0]);
        }

        const dUseIm = document.getElementById('design_use_im').checked ? 1 : 0;
        formData.append("design_use_im", dUseIm);
        formData.append("design_canvas_id", document.getElementById('design_canvas_id').value);
        if(!dUseIm && document.getElementById('design_file') && document.getElementById('design_file').files[0]) {
            formData.append("design_file", document.getElementById('design_file').files[0]);
        }

        const cUseIm = document.getElementById('cut_use_im').checked ? 1 : 0;
        formData.append("cut_use_im", cUseIm);
        formData.append("cut_canvas_id", document.getElementById('cut_canvas_id').value);
        if(!cUseIm && document.getElementById('cut_file') && document.getElementById('cut_file').files[0]) {
            formData.append("cut_file", document.getElementById('cut_file').files[0]);
        }

        const pUseIm = document.getElementById('preview_use_im').checked ? 1 : 0;
        formData.append("preview_use_im", pUseIm);
        formData.append("preview_canvas_id", document.getElementById('preview_canvas_id').value);
        if(!pUseIm && document.getElementById('preview_file') && document.getElementById('preview_file').files[0]) {
            formData.append("preview_file", document.getElementById('preview_file').files[0]);
        }

        const assetsMetadata = [];
        document.querySelectorAll('#assetsWrapper .asset-row-box').forEach(row => {
            const nameEl = row.querySelector('.asset_name');
            const imEl = row.querySelector('.asset_use_im');
            const canvasEl = row.querySelector('.asset_canvas_id');
            const fileEl = row.querySelector('.asset_file');
            // 🎯 පරණ saved file name එක ලබා ගැනීම:
            const savedFileName = row.getAttribute('data-saved-file') || "none";

            if (nameEl) {
                const aName = nameEl.value;
                const useIm = imEl && imEl.checked ? 1 : 0;
                const canvasId = canvasEl ? canvasEl.value : "";
                let clientFilename = "";
                if (!useIm && fileEl && fileEl.files[0]) { 
                    clientFilename = fileEl.files[0].name; 
                    formData.append("req_image_files", fileEl.files[0]); 
                }
                // 🎯 saved_file_name එක backend එකට යැවීම:
                assetsMetadata.push({ 
                    requirement_name: aName, 
                    use_image_maker: useIm, 
                    canvas_id: canvasId, 
                    client_filename: clientFilename,
                    saved_file_name: savedFileName 
                });
            }
        });
        formData.append("assets_json", JSON.stringify(assetsMetadata));

        let targetUrl = `${API_BASE}/cards`;
        if(currentEditCardId) targetUrl = `${API_BASE}/cards/update/${currentEditCardId}`;
        else { 
            formData.append("card_id", cardIdCustom);
            formData.append("card_name", cardName); 
            formData.append("folder_name", folderName); 
        }

        const response = await fetch(targetUrl, { method: 'POST', body: formData });
        if(response.ok) { 
            document.getElementById('cardEditorSection').style.display = 'none'; 
            loadCardsList(); 
            alert("✅ Card Successfully Saved!");
        } else {
            const errData = await response.json();
            alert("❌ සුරැකීමට නොහැකි වුණා: " + (errData.detail || "Server Error"));
        }
    } catch (err) {
        console.error("Submit Error:", err);
        alert(`❌ Save error: ${err.message}`);
    }
}

async function deleteCardNode(cardId) {
    if(confirm(`Are you sure you want to delete card node: ${cardId}?`)) {
        const res = await fetch(`${API_BASE}/cards/${cardId}`, { method: 'DELETE' });
        if(res.ok) {
            alert("Card deleted successfully!");
            loadCardsList();
        } else {
            alert("❌ මකාදැමීමට නොහැකි වුණා.");
        }
    }
}

async function loadGlobalHints() {
    try {
        const res = await fetch(`${API_BASE}/hints`);
        const data = await res.json();
        if (data.hintsString !== undefined) {
            document.getElementById('global_text_hints').value = data.hintsString;
        }
    } catch(err) {
        console.error("Hints load error:", err);
    }
}

async function saveGlobalHints() {
    const hintsVal = document.getElementById('global_text_hints').value;
    const formData = new FormData();
    formData.append("hintsString", hintsVal);
    
    try {
        const res = await fetch(`${API_BASE}/hints`, { method: 'POST', body: formData });
        if(res.ok) {
            alert("✅ Text Slot Hints Saved Successfully!");
            loadGlobalHints();
        } else {
            alert("❌ Save failed. Check server connection.");
        }
    } catch(err) {
        console.error("Hints save error:", err);
        alert("❌ Network Error!");
    }
}

async function loadCanvasesList() {
    const res = await fetch(`${API_BASE}/canvases`);
    const rawCanvases = await res.json();
    
    globalCanvasesList = rawCanvases.map(c => {
        if (c.canvas_id) c.canvas_id = c.canvas_id.trim();
        return c;
    });
    
    handleCanvasSearch(false);
}

function handleCanvasSearch(resetPage = true) {
    const searchElement = document.getElementById('search_canvases');
    const query = searchElement ? searchElement.value.toLowerCase().trim() : "";
    if(resetPage) canvasesCurrentPage = 1;
    canvasesFilteredList = globalCanvasesList.filter(c => 
        (c.canvas_name && c.canvas_name.toLowerCase().includes(query)) || 
        (c.canvas_id && c.canvas_id.toLowerCase().includes(query))
    );
    renderCanvasesTable();
}

function renderCanvasesTable() {
    const container = document.getElementById('canvasListContainer');
    container.innerHTML = '';
    const totalItems = canvasesFilteredList.length;

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    if (canvasesCurrentPage > totalPages) canvasesCurrentPage = totalPages;

    const startIdx = (canvasesCurrentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, totalItems);
    const pageItems = canvasesFilteredList.slice(startIdx, endIdx);
    
    if(pageItems.length === 0) {
        container.innerHTML = '<div class="item-row"><div class="item-info">ගැලපෙන කිසිදු කැන්වස් ලේවුට් එකක් සොයාගත නොහැක.</div></div>';
    } else {
        pageItems.forEach(c => {
            const cleanId = c.canvas_id ? c.canvas_id.trim() : "";
            container.innerHTML += `
                <div class="item-row">
                    <div class="item-info">${c.canvas_name} <span>ID: ${cleanId} (${c.width}x${c.height})</span></div>
                    <div>
                        <button class="btn-blue" style="background:#0984e3;" onclick="editExistingCanvas('${cleanId}')">Edit Workspace</button>
                        <button class="btn-danger" onclick="deleteCanvas('${cleanId}')">Delete</button>
                    </div>
                </div>`;
        });
    }

    renderPagination(totalItems, canvasesCurrentPage, 'canvases', (newPage) => {
        canvasesCurrentPage = newPage;
        renderCanvasesTable();
    });
}

function openNewCanvasEditor() {
    populateCardDropdown();
    document.getElementById('editorTitle').innerText = "Canvas workspace setup";
    document.getElementById('canvas_id').value = ""; document.getElementById('canvas_id').disabled = false;
    document.getElementById('canvas_name').value = ""; document.getElementById('bgUpload').value = "";
    document.getElementById('canvas_card_id').value = "none";
    document.getElementById('category_folder').value = "root";
    backgroundImage = null; savedBgName = "none"; layers = [];
    document.getElementById('bg_path_hint').innerText = "";
    refreshLayersUI(); renderCanvas();
    document.getElementById('canvasEditorSection').style.display = 'block';
}

function updateSavedBgPathHint() {
    const cardId = document.getElementById('canvas_card_id').value;
    const category = document.getElementById('category_folder').value;
    const foundCard = globalCardsList.find(c => c.card_id === cardId);
    
    if (foundCard) {
        let sub = category === "root" ? "" : `/${category}`;
        document.getElementById('bg_path_hint').innerText = `Target Storage Path: /image_templates/${foundCard.folder_name}${sub}/`;
    } else {
        document.getElementById('bg_path_hint').innerText = "Target Storage Path: /image_templates/christmas_card/";
    }

    fetchAndPopulateBgFiles();
}

function fetchAndPopulateBgFiles() {
    const cardId = document.getElementById('canvas_card_id').value;
    const category = document.getElementById('category_folder').value;
    const select = document.getElementById('existing_bg_select');
    if (!select) return;

    if (!cardId || cardId === "none") {
        select.innerHTML = '<option value="none">-- Select Card Node First --</option>';
        return;
    }

    fetch(`${API_BASE}/cards/${cardId}/folder-files?category=${category}`)
        .then(res => res.json())
        .then(data => {
            const files = data.files || [];
            const folderName = data.folder_name;
            select.innerHTML = '<option value="none">-- Choose Existing Image --</option>';
            if (files.length === 0) {
                select.innerHTML = '<option value="none">⚠️ මෙම ෆෝල්ඩරයේ ගොනු නොමැත</option>';
                return;
            }
            files.forEach(f => {
                const opt = document.createElement('option');
                let relPath = category === "root" ? `${folderName}/${f}` : `${folderName}/${category}/${f}`;
                opt.value = relPath;
                opt.textContent = f;
                select.appendChild(opt);
            });
        })
        .catch(err => console.error("Error fetching folder files:", err));
}

function onSelectExistingBgImage() {
    const select = document.getElementById('existing_bg_select');
    const selectedPath = select.value;

    if (!selectedPath || selectedPath === "none") {
        backgroundImage = null;
        savedBgName = "none";
        renderCanvas();
        return;
    }

    savedBgName = selectedPath;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function() {
        backgroundImage = img;
        renderCanvas();
    };
    img.src = `${BACKEND_STATIC}/image_templates/${selectedPath}?t=${new Date().getTime()}`;
}

function loadBackground(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() { backgroundImage = img; renderCanvas(); };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function populateCardDropdown() {
    const select = document.getElementById('canvas_card_id');
    if (!select) return;
    
    const currentVal = select.value;
    select.innerHTML = '<option value="none">-- Select Linked Card Node (Optional) --</option>';
    
    if (globalCardsList && globalCardsList.length > 0) {
        globalCardsList.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.card_id;
            opt.textContent = `${c.card_name} (${c.card_id})`;
            select.appendChild(opt);
        });
    }
    
    select.value = currentVal || "none";
}

async function editExistingCanvas(canvasId) {
    populateCardDropdown();
    const cleanCanvasId = canvasId ? canvasId.trim() : "";
    const res = await fetch(`${API_BASE}/canvases/${cleanCanvasId}`);
    const data = await res.json();

    document.getElementById('editorTitle').innerText = `Editing Canvas Workspace: ${data.canvas.canvas_name}`;
    document.getElementById('canvas_id').value = data.canvas.canvas_id; 
    document.getElementById('canvas_id').disabled = true; 
    document.getElementById('canvas_name').value = data.canvas.canvas_name;
    document.getElementById('canvasWidth').value = data.canvas.width;
    document.getElementById('canvasHeight').value = data.canvas.height;
    document.getElementById('canvas_card_id').value = data.canvas.card_id || "none";
    document.getElementById('category_folder').value = data.canvas.category_folder || "root";
    document.getElementById('canvas_output_format').value = data.canvas.output_format || "png";
    
    savedBgName = data.canvas.background_image || "none"; 
    updateSavedBgPathHint();
    document.getElementById('bgUpload').value = "";
    canvas.width = data.canvas.width; canvas.height = data.canvas.height;

    if (savedBgName && savedBgName !== "none") {
        let cleanBgPath = savedBgName;
        if (cleanBgPath.includes("image_templates/")) cleanBgPath = cleanBgPath.split("image_templates/")[1];

        const img = new Image();
        img.crossOrigin = "anonymous"; 
        img.onload = function() { backgroundImage = img; renderCanvas(); };
        img.onerror = function(e) { console.error("Background Load Failed:", e); };
        img.src = `${BACKEND_STATIC}/image_templates/${cleanBgPath}?t=${new Date().getTime()}`;
    } else { 
        backgroundImage = null; 
    }

    layers = data.layers.map(l => ({
        id: l.layer_id, type: l.layer_type, placeholder_id: l.placeholder_id,
        x: l.x_axis, y: l.y_axis, w: l.width || 0, h: l.height || 0, 
        blendMode: l.blend_mode || 'source-over', opacity: l.opacity !== undefined ? l.opacity : 100, maskImage: l.mask_image || 'none',
        maskImgObj: null,
        font_id: l.font_id || 1, font_size: l.font_size, font_color: l.font_color, rotation: l.rotation,
        text_align: l.text_align || 'left', preview_text: l.preview_text || "Sample Text"
    }));

    // 🎯 Image Mask Loading Error-Proof Engine
    let imagesToLoad = layers.filter(l => l.type === 'Image' && l.maskImage && l.maskImage !== "none").length;
    let imagesLoaded = 0;

    const checkAndRenderUI = async () => {
        imagesLoaded++;
        if (imagesLoaded >= imagesToLoad) {
            for (let tL of layers) { 
                if (tL.type === 'Text') await ensureFontLoaded(tL.font_id); 
            }
            refreshLayersUI();
            renderCanvas();
        }
    };

    if (imagesToLoad === 0) {
        for (let l of layers) { 
            if (l.type === 'Text') await ensureFontLoaded(l.font_id); 
        }
        refreshLayersUI();
        renderCanvas();
    } else {
        for (let l of layers) {
            if (l.type === 'Image' && l.maskImage && l.maskImage !== "none") {
                let cleanPath = l.maskImage;
                if (cleanPath.includes("image_templates/")) cleanPath = cleanPath.split("image_templates/")[1];
                
                const mImg = new Image();
                mImg.crossOrigin = "anonymous"; 
                
                // Onload සහ Onerror දෙකේදීම Render UI එක Safe එකේ Execute වේ
                mImg.onload = async function() { 
                    l.maskImgObj = mImg; 
                    await checkAndRenderUI();
                };
                mImg.onerror = async function() {
                    console.warn(`⚠️ Mask Image Load Failed: ${cleanPath}`);
                    await checkAndRenderUI(); // Error එකක් ආවත් Layers ටික UI එකෙන් අතුරුදහන් නොවේ!
                };
                
                mImg.src = `${BACKEND_STATIC}/image_templates/${cleanPath}?t=${new Date().getTime()}`;
            } else if (l.type === 'Text') {
                await ensureFontLoaded(l.font_id);
            }
        }
    }
    document.getElementById('canvasEditorSection').style.display = 'block';
}

function resizeCanvas() {
    canvas.width = document.getElementById('canvasWidth').value;
    canvas.height = document.getElementById('canvasHeight').value;
    renderCanvas();
}

function addLayer(type) {
    layers.push({
        id: type === 'Image' ? `user_layer_${layers.length + 1}` : `user_text_${layers.length + 1}`,
        type: type, placeholder_id: type === 'Image' ? 'image_01' : 'text_01',
        x: 50, y: 50, w: type === 'Image' ? 120 : 0, h: type === 'Image' ? 120 : 0, 
        blendMode: 'source-over', opacity: 100, maskImage: 'none', maskImgObj: null,
        font_id: systemFonts.length > 0 ? systemFonts[0].id : 1, font_size: 28, font_color: '#000000', rotation: 0,
        text_align: 'left', preview_text: "Sample Text"
    });
    if(type === 'Text') ensureFontLoaded(layers[layers.length - 1].font_id);
    refreshLayersUI(); renderCanvas();
}

function deleteLayer(index) { layers.splice(index, 1); refreshLayersUI(); renderCanvas(); }
async function updateLayer(index, prop, value) { layers[index][prop] = value; if(prop === 'font_id') await ensureFontLoaded(value); renderCanvas(); }

async function loadLiveMaskFile(event, index) {
    const file = event.target.files[0];
    if (!file) return;

    // 1. Live Preview එක Canvas මත පෙන්වීම
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            layers[index].maskImgObj = img;
            renderCanvas(); 
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    // 2. Direct Server Upload එක (Variable Name Fix කර ඇත)
    const cardId = document.getElementById('canvas_card_id').value;
    const foundCard = globalCardsList.find(c => c.card_id === cardId);
    const folderName = foundCard ? foundCard.folder_name : "christmas_card";

    const uploadData = new FormData(); // 👈 FormData variable එක නිවැරදි කරන ලදී
    uploadData.append("folder_name", folderName);
    uploadData.append("mask_file", file);

    try {
        const res = await fetch(`${API_BASE}/upload-mask-direct`, { method: 'POST', body: uploadData });
        const data = await res.json();
        if (data.status === "success") {
            // Layer Object එකේ Mask Path එක Permanent ලෙස සටහන් වේ
            layers[index].maskImage = data.mask_path;
            console.log(`✅ Mask Direct Uploaded & Saved Path: ${data.mask_path}`);
            
            // UI එකේ "Active: mask.png" යන්න පෙන්වීමට UI එක Refresh කිරීම
            refreshLayersUI();
        }
    } catch (err) {
        console.error("❌ Mask Direct Upload Failed:", err);
    }
}

function refreshLayersUI() {
    const container = document.getElementById('layersContainer'); container.innerHTML = '';
    layers.forEach((layer, index) => {
        const box = document.createElement('div'); box.className = 'layer-item';
        let textControls = ''; let sizeControls = ''; let advancedControls = '';

        if(layer.type === 'Text') {
            let fontOptions = ''; systemFonts.forEach(f => { fontOptions += `<option value="${f.id}" ${layer.font_id == f.id ? 'selected' : ''}>${f.font_name}</option>`; });
            sizeControls = `<div class="quad-row" style="grid-template-columns: repeat(2, 1fr);"><div class="form-group"><label>X</label><input type="number" value="${layer.x}" oninput="updateLayer(${index}, 'x', parseInt(this.value)||0)"></div><div class="form-group"><label>Y</label><input type="number" value="${layer.y}" oninput="updateLayer(${index}, 'y', parseInt(this.value)||0)"></div></div>`;
            textControls = `<div class="row" style="margin-top: 5px;"><div class="form-group" style="flex: 1.5;"><label>Preview Text</label><input type="text" value="${layer.preview_text || 'Sample Text'}" oninput="updateLayer(${index}, 'preview_text', this.value)"></div><div class="form-group" style="flex: 1.5;"><label>Font Family</label><select onchange="updateLayer(${index}, 'font_id', parseInt(this.value))">${fontOptions || '<option value="1">Arial</option>'}</select></div></div><div class="row" style="margin-top: 5px;"><div class="form-group"><label>Size</label><input type="number" value="${layer.font_size}" oninput="updateLayer(${index}, 'font_size', parseInt(this.value)||12)"></div><div class="form-group"><label>Text Align</label><select onchange="updateLayer(${index}, 'text_align', this.value)"><option value="left" ${layer.text_align === 'left' ? 'selected' : ''}>Left Align</option><option value="center" ${layer.text_align === 'center' ? 'selected' : ''}>Center Align</option><option value="right" ${layer.text_align === 'right' ? 'selected' : ''}>Right Align</option></select></div><div class="form-group"><label>Color</label><input type="color" value="${layer.font_color}" oninput="updateLayer(${index}, 'font_color', this.value)" style="height:32px; padding:2px;"></div><div class="form-group"><label>Rot (°)</label><input type="number" value="${layer.rotation}" oninput="updateLayer(${index}, 'rotation', parseInt(this.value)||0)"></div></div>`;
        } else {
            sizeControls = `<div class="quad-row"><div class="form-group"><label>X</label><input type="number" value="${layer.x}" oninput="updateLayer(${index}, 'x', parseInt(this.value)||0)"></div><div class="form-group"><label>Y</label><input type="number" value="${layer.y}" oninput="updateLayer(${index}, 'y', parseInt(this.value)||0)"></div><div class="form-group"><label>W</label><input type="number" value="${layer.w}" oninput="updateLayer(${index}, 'w', parseInt(this.value)||0)"></div><div class="form-group"><label>H</label><input type="number" value="${layer.h}" oninput="updateLayer(${index}, 'h', parseInt(this.value)||0)"></div></div>`;
            let maskDisplayHint = (layer.maskImage && layer.maskImage !== "none") 
                ? `<span style="font-size:11px; color:#2ed573; font-weight:bold;">Active: ${layer.maskImage}</span>` 
                : `<span style="font-size:11px; color:gray;">No layout mask loaded</span>`;
            advancedControls = `<div class="row" style="margin-top: 8px;">
                    <div class="form-group" style="flex: 1;"><label>Blending Mode</label><select onchange="updateLayer(${index}, 'blendMode', this.value)"><option value="source-over" ${layer.blendMode === 'source-over' ? 'selected' : ''}>Normal</option><option value="screen" ${layer.blendMode === 'screen' ? 'selected' : ''}>Screen</option><option value="multiply" ${layer.blendMode === 'multiply' ? 'selected' : ''}>Multiply</option><option value="overlay" ${layer.blendMode === 'overlay' ? 'selected' : ''}>Overlay</option></select></div>
                    <div class="form-group" style="flex: 0.8;"><label>Opacity</label><input type="number" min="0" max="100" value="${layer.opacity}" oninput="updateLayer(${index}, 'opacity', parseInt(this.value)||100)"></div>
                    <div class="form-group" style="flex: 0.8;"><label>Rot (°)</label><input type="number" value="${layer.rotation || 0}" oninput="updateLayer(${index}, 'rotation', parseInt(this.value)||0)"></div>
                    <div class="form-group" style="flex: 2;">
                        <label>Upload Layer Mask Image</label>
                        <input type="file" class="layer_mask_file_input" accept="image/*" style="font-size:12px;" onchange="loadLiveMaskFile(event, ${index})">
                        ${maskDisplayHint}
                    </div>
                </div>`;
        }
        box.innerHTML = `<button class="btn-danger" style="padding:2px 6px;" onclick="deleteLayer(${index})">X</button><div style="margin-bottom: 8px; font-size:13px;"><strong>[${layer.type}]</strong> ID: <input type="text" value="${layer.id}" oninput="updateLayer(${index}, 'id', this.value)" style="width:90px; display:inline-block; padding:3px;"> Maps: <input type="text" value="${layer.placeholder_id}" oninput="updateLayer(${index}, 'placeholder_id', this.value)" style="width:65px; color:red; font-weight:bold; display:inline-block; padding:3px;"></div>${sizeControls}${advancedControls}${textControls}`;
        container.appendChild(box);
    });
}

function renderCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    ctx.fillStyle = "rgba(0,0,0,0.05)"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (backgroundImage) ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    
    layers.forEach(layer => {
        ctx.save(); 
        ctx.globalAlpha = (layer.opacity !== undefined ? layer.opacity : 100) / 100;
        
        let centerX = layer.x + layer.w / 2; 
        let centerY = layer.y + layer.h / 2;
        
        ctx.translate(centerX, centerY); 
        ctx.rotate((layer.rotation * Math.PI) / 180); 
        ctx.translate(-centerX, -centerY);
        
        if(layer.type === 'Image') {
            if (layer.maskImgObj) {
                const imageCanvas = document.createElement('canvas');
                imageCanvas.width = layer.w; imageCanvas.height = layer.h;
                const imgCtx = imageCanvas.getContext('2d');

                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = layer.w; maskCanvas.height = layer.h;
                const maskCtx = maskCanvas.getContext('2d');
                
                imgCtx.drawImage(defaultGridImage, 0, 0, layer.w, layer.h);
                maskCtx.drawImage(layer.maskImgObj, 0, 0, layer.w, layer.h);
                
                try {
                    const imgData = imgCtx.getImageData(0, 0, layer.w, layer.h);
                    const maskData = maskCtx.getImageData(0, 0, layer.w, layer.h);
                    for (let i = 0; i < maskData.data.length; i += 4) {
                        let v = (maskData.data[i] + maskData.data[i+1] + maskData.data[i+2]) / 3; 
                        imgData.data[i+3] = imgData.data[i+3] * (v / 255);
                    }
                    imgCtx.putImageData(imgData, 0, 0);
                } catch(e) { console.error("Mask Error:", e); }

                ctx.drawImage(imageCanvas, layer.x, layer.y);
            } else {
                ctx.drawImage(defaultGridImage, layer.x, layer.y, layer.w, layer.h);
            }
        } else {
            const fontObj = systemFonts.find(f => f.id === layer.font_id); 
            ctx.fillStyle = layer.font_color;
            ctx.font = `${layer.font_size}px "${fontObj ? fontObj.font_name : 'Arial'}"`; 
            ctx.textAlign = layer.text_align || 'left'; 
            ctx.textBaseline = "top";
            ctx.fillText(layer.preview_text || "Sample Text", layer.x, layer.y);
        }
        ctx.restore();
    });
}

async function saveTemplateToDatabase() {
    const fileInput = document.getElementById('bgUpload');
    const formData = new FormData();
    
    formData.append("canvas_id", document.getElementById('canvas_id').value);
    formData.append("card_id", document.getElementById('canvas_card_id').value);
    formData.append("canvas_name", document.getElementById('canvas_name').value);
    formData.append("width", parseInt(canvas.width));
    formData.append("height", parseInt(canvas.height));
    formData.append("category_folder", document.getElementById('category_folder').value);
    formData.append("existing_bg_path", savedBgName);
    formData.append("output_format", document.getElementById('canvas_output_format').value);

    if (fileInput.files[0]) {
        formData.append("bg_file", fileInput.files[0]);
    }

    // 🎯 Mask Images සෘජුවම Layer Object හි ගබඩා වී ඇති maskImage Path එකෙන් ලබාගැනීම
    const cleanLayers = layers.map(l => ({
        layer_id: l.id, 
        layer_type: l.type, 
        placeholder_id: l.placeholder_id, 
        x_axis: l.x, 
        y_axis: l.y, 
        width: l.w || 0, 
        height: l.h || 0, 
        blend_mode: l.blendMode, 
        opacity: l.opacity, 
        mask_image: l.maskImage || "none", // 👈 Direct Upload එකෙන් ලැබුණු Path එක භාවිතා වේ
        font_id: l.font_id, 
        font_size: l.font_size, 
        font_color: l.font_color, 
        rotation: l.rotation, 
        text_align: l.text_align || 'left', 
        preview_text: l.preview_text || 'Sample Text'
    }));
    formData.append("layers_json", JSON.stringify(cleanLayers));

    const res = await fetch(`${API_BASE}/save-template`, { method: 'POST', body: formData });
    
    if(res.ok) {
        const resData = await res.json();
        savedBgName = resData.background_image;
        alert("✅ Canvas workspace layout and layer masks successfully deployed inside architecture!");
        document.getElementById('canvasEditorSection').style.display = 'none';
        loadCanvasesList();
    }
}

async function loadFontsList() {
    const res = await fetch(`${API_BASE}/fonts`); 
    systemFonts = await res.json();
    
    if(document.getElementById('fontsListContainer')) {
        handleFontSearch(false);
    }
}

function handleFontSearch(resetPage = true) {
    const query = document.getElementById('search_fonts').value.toLowerCase().trim();
    if(resetPage) fontsCurrentPage = 1;
    fontsFilteredList = systemFonts.filter(f => 
        f.font_name.toLowerCase().includes(query)
    );
    renderFontsTable();
}

function renderFontsTable() {
    const container = document.getElementById('fontsListContainer');
    container.innerHTML = '';
    const totalItems = fontsFilteredList.length;

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    if (fontsCurrentPage > totalPages) fontsCurrentPage = totalPages;

    const startIdx = (fontsCurrentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, totalItems);
    const pageItems = fontsFilteredList.slice(startIdx, endIdx);
    
    if(pageItems.length === 0) {
        container.innerHTML = '<div class="item-row"><div class="item-info">ගැලපෙන කිසිදු ෆොන්ට් එකක් සොයාගත නොහැක.</div></div>';
    } else {
        pageItems.forEach(f => { 
            container.innerHTML += `<div class="item-row"><div class="item-info">${f.font_name} <span>Path: ${f.file_path}</span></div><button class="btn-danger" onclick="deleteFont(${f.id})">Delete</button></div>`; 
        });
    }

    renderPagination(totalItems, fontsCurrentPage, 'fonts', (newPage) => {
        fontsCurrentPage = newPage;
        renderFontsTable();
    });
}

async function uploadNewFont() {
    const name = document.getElementById('new_font_name').value; 
    const fileInput = document.getElementById('font_file_upload');
    if(!name || !fileInput.files[0]) return alert("Please fill name and choose file");
    const formData = new FormData(); 
    formData.append("font_name", name); 
    formData.append("file", fileInput.files[0]);
    const res = await fetch(`${API_BASE}/fonts`, { method: 'POST', body: formData });
    if(res.ok) { alert("Font Uploaded successfully!"); loadFontsList(); }
}

async function deleteCanvas(canvasId) {
    const cleanCanvasId = canvasId ? canvasId.trim() : "";
    if(confirm(`Are you sure you want to delete canvas template: ${cleanCanvasId}?`)) {
        const res = await fetch(`${API_BASE}/canvases/${cleanCanvasId}`, { method: 'DELETE' });
        if(res.ok) {
            alert("Canvas deleted successfully!");
            loadCanvasesList(); 
        } else {
            alert("❌ මකාදැමීමට නොහැකි වුණා.");
        }
    }
}

async function deleteFont(id) { 
    if(confirm("Delete this font?")) { 
        await fetch(`${API_BASE}/fonts/${id}`, { method: 'DELETE' }); 
        loadFontsList(); 
    } 
}

async function ensureFontLoaded(fontId) {
    const fontObj = systemFonts.find(f => f.id === fontId); 
    if (!fontObj || loadedFonts.has(fontObj.font_name)) return fontObj ? fontObj.font_name : "Arial";
    try {
        const fontFace = new FontFace(fontObj.font_name, `url(${BACKEND_STATIC}/${fontObj.file_path})`); 
        await fontFace.load();
        document.fonts.add(fontFace); 
        loadedFonts.add(fontObj.font_name); 
        renderCanvas();
    } catch (err) { console.error(err); }
    return fontObj.font_name;
}

async function testVideoPipeline() {
    if (!currentEditCardId) return alert("❌ කරුණාකර ප්‍රථමයෙන් Card Node එකක් තෝරන්න.");
    
    console.log("🎬 Starting Test Video Generation Pipeline...");
    
    try {
        const cardDetailRes = await fetch(`${API_BASE}/cards/${currentEditCardId}`);
        const data = await cardDetailRes.json();
        const card = data.card;
        const assets = data.assets;
        
        if (!card || !assets) return alert("❌ Card Details සොයාගත නොහැකි විය.");

        alert("⏳ Video Rendering ආරම්භ විය! (මේ සඳහා තත්පර 15-30ක් පමණ ගතවිය හැක, OK ක්ලික් කර රැඳී සිටින්න)");

        let formDataForVideo = new FormData();

        for (let asset of assets) {
            let fieldName = asset.asset_name; 
            
            if (asset.use_image_maker === 1) {
                const gridCanvas = document.createElement('canvas');
                gridCanvas.width = 500;
                gridCanvas.height = 500;
                const testCtx = gridCanvas.getContext('2d');
                testCtx.fillStyle = '#ffffff';
                testCtx.fillRect(0, 0, 500, 500);
                const userImgBlob = await new Promise(resolve => gridCanvas.toBlob(resolve, 'image/jpeg'));

                let imFormData = new FormData();
                imFormData.append("canvas_id", asset.canvas_id);
                imFormData.append("user_image", userImgBlob, "test_user.jpg");
                imFormData.append("user_text_val", "Test User");

                let imRes = await fetch(`${API_BASE}/v1/render-user-card`, { method: "POST", body: imFormData });
                let imResult = await imRes.json();
                
                let cleanPath = imResult.download_url;
                if (cleanPath.includes("image_templates/")) cleanPath = cleanPath.split("image_templates/")[1];

                let imgBlobRes = await fetch(`${BACKEND_STATIC}/image_templates/${cleanPath}?t=${new Date().getTime()}`);
                let imgBlob = await imgBlobRes.blob();
                formDataForVideo.append(fieldName, imgBlob, `${fieldName}.png`);
            } else {
                let staticImgUrl = `${BACKEND_STATIC}/image_templates/${card.folder_name}/${asset.file_name}?t=${new Date().getTime()}`;
                let imgBlobRes = await fetch(staticImgUrl);
                let imgBlob = await imgBlobRes.blob();
                formDataForVideo.append(fieldName, imgBlob, asset.file_name);
            }
        }

        let targetApiUrl = `${window.location.origin}${card.api_link}`;
        console.log("🚀 Executing Video Render API Request to:", targetApiUrl);

        let videoRes = await fetch(targetApiUrl, { method: "POST", body: formDataForVideo });
        let videoResult = await videoRes.json();

        if (videoResult.success) {
            alert(`✅ සාර්ථකයි! වීඩියෝව සාර්ථකව ජනනය විය!\n\nVideo URL: ${videoResult.videoUrl}`);
            window.open(videoResult.videoUrl, '_blank');
        } else {
            alert("❌ වීඩියෝ ජනනය කිරීමේදී දෝෂයක් සිදු විය: " + (videoResult.error || "Unknown Server Error"));
        }

    } catch (err) {
        console.error("Pipeline Execution Failure:", err);
        alert(`❌ වීඩියෝ එන්ජිමේ දෝෂයක්: ${err.message}`);
    }
}

async function testRenderUserCardImage() {
    const canvasId = document.getElementById('canvas_id').value;
    if (!canvasId) return alert("❌ කරුණාකර ප්‍රථමයෙන් Canvas ID එකක් ඇතුළත් කරන්න.");
    alert("⏳ Image Maker එකෙන් පින්තූරය රෙන්ඩර් වෙමින් පවතී...");

    const testCanvas = document.createElement('canvas');
    testCanvas.width = defaultGridImage.width || 500;
    testCanvas.height = defaultGridImage.height || 500;
    testCanvas.getContext('2d').drawImage(defaultGridImage, 0, 0);

    testCanvas.toBlob(async (userImgBlob) => {
        try {
            let imFormData = new FormData();
            imFormData.append("canvas_id", canvasId);
            imFormData.append("user_image", userImgBlob, "test_user.jpg");
            imFormData.append("user_text_val", "Test Save Text");

            let imRes = await fetch(`${API_BASE}/v1/render-user-card`, { method: "POST", body: imFormData });
            let imResult = await imRes.json();

            if (imResult && imResult.download_url) {
                let cleanPath = imResult.download_url;
                if (cleanPath.includes("image_templates/")) cleanPath = cleanPath.split("image_templates/")[1];
                alert(`✅ සාර්ථකයි!\n\nImage එක සේව් වුණු පථය:\n/image_templates/${cleanPath}\n\nසම්පූර්ණ URL එක:\n${BACKEND_STATIC}/image_templates/${cleanPath}`);
            } else {
                alert("❌ සේව් කිරීමේදී දෝෂයක් සිදුවුණා. බැක්එන්ඩ් එකේ දත්ත පරීක්ෂා කරන්න.");
            }
        } catch (err) {
            console.error("Render Testing Error:", err);
            alert(`❌ බැක්එන්ඩ් (FastAPI) එක සමඟ සම්බන්ධ විය නොහැක! Python Port රන් වෙනවාද බලන්න. Host: ${CURRENT_HOST}`);
        }
    }, 'image/jpeg');
}

async function generatePrintPDF() {
    if (!currentEditCardId) return alert("❌ Card Node එකක් තෝරා නොමැත.");
    
    console.log("📄 Starting Dynamic PDF Generation Pipeline...");

    try {
        alert("⏳ පිටු 2ක Print-Ready PDF එක සැබෑ දත්ත සමඟ සෑදෙමින් පවතී... (OK ක්ලික් කර මොහොතක් රැඳී සිටින්න)");

        const cardDetailRes = await fetch(`${API_BASE}/cards/${currentEditCardId}`);
        const data = await cardDetailRes.json();
        const card = data.card;
        const assets = data.assets || [];

        let formData = new FormData();
        formData.append("card_id", currentEditCardId);

        let gridRes = await fetch('/grid.jpg');
        if (!gridRes.ok) {
            gridRes = await fetch('/public/grid.jpg');
        }
        
        if (!gridRes.ok) {
            throw new Error("Server එකේ '/grid.jpg' පින්තූරය සොයාගැනීමට නොහැක. කරුණාකර 'public/grid.jpg' පවතිනවාද බලන්න.");
        }

        const gridBlob = await gridRes.blob();
        const gridFile = new File([gridBlob], "grid.jpg", { type: "image/jpeg" });

        let imageSlotCount = 0;
        
        if (card.image_slots) {
            const parsed = card.image_slots.split(',').map(s => s.trim()).filter(Boolean);
            imageSlotCount = parsed.length;
        }
        
        if (assets.length > imageSlotCount) {
            imageSlotCount = assets.length;
        }

        if (imageSlotCount === 0) imageSlotCount = 1;

        for (let i = 1; i <= imageSlotCount; i++) {
            const slotName = `image_${String(i).padStart(2, '0')}`;
            formData.append(slotName, gridFile);
        }
        formData.append("user_image", gridFile);

        let textSlotCount = 0;
        if (card.text_slots) {
            const parsed = card.text_slots.split(',').map(s => s.trim()).filter(Boolean);
            textSlotCount = parsed.length;
        }
        if (textSlotCount === 0) textSlotCount = 2;

        for (let i = 1; i <= textSlotCount; i++) {
            const slotName = `text_${String(i).padStart(2, '0')}`;
            const numStr = String(i).padStart(2, '0');
            formData.append(slotName, `Name ${numStr}`);
        }
        formData.append("user_text_val", "Name 01");

        console.log("🚀 Sending Real Image File with image_## format to Python PDF Engine...");
        let res = await fetch(`${API_BASE}/v1/generate-card-pdf`, { method: "POST", body: formData });
        let result = await res.json();
        
        if (result.status === "success") {
            alert("✅ PDF එක සැබෑ දත්ත සමඟ සාර්ථකව සෑදුණා!");
            window.open(BACKEND_STATIC + result.download_url, '_blank');
        } else {
            alert("❌ PDF සෑදීමට නොහැකි වුණා: " + (result.detail || "Unknown Error"));
        }
    } catch (err) {
        console.error("PDF Pipeline Error:", err);
        alert(`❌ PDF එන්ජිමේ දෝෂයක්: ${err.message}`);
    }
}

// =================================================================
// 📸 SLOTS MANAGEMENT FUNCTIONS ENGINE (\web_images)
// =================================================================

async function loadSlotsList() {
    try {
        const res = await fetch('/api/slots');
        const data = await res.json();
        if (data.success) {
            globalSlotsList = data.slots;
            handleSlotSearch(false);
        }
    } catch (err) {
        console.error("Error loading slots:", err);
    }
}

function handleSlotSearch(resetPage = true) {
    const searchElement = document.getElementById('search_slots');
    const query = searchElement ? searchElement.value.toLowerCase().trim() : "";
    if (resetPage) slotsCurrentPage = 1;
    
    slotsFilteredList = globalSlotsList.filter(s => 
        `image_${s.slot}`.toLowerCase().includes(query) || 
        s.slot.includes(query)
    );
    renderSlotsTable();
}

function renderSlotsTable() {
    const container = document.getElementById('slotsListContainer');
    if (!container) return;
    container.innerHTML = '';
    const totalItems = slotsFilteredList.length;

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    if (slotsCurrentPage > totalPages) slotsCurrentPage = totalPages;

    const startIdx = (slotsCurrentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, totalItems);
    const pageItems = slotsFilteredList.slice(startIdx, endIdx);

    if (pageItems.length === 0) {
        container.innerHTML = '<div class="item-row"><div class="item-info">ගැලපෙන කිසිදු ස්ලොට් එකක් සොයාගත නොහැක.</div></div>';
    } else {
        pageItems.forEach(s => {
            container.innerHTML += `
                <div class="item-row">
                    <div class="item-info" style="display:flex; gap:25px; align-items:center;">
                        <strong style="width:110px; font-size:15px; color:#2f3640;">image_${s.slot}</strong>
                        <span style="font-size:13px; color:#555;">Thumb: <b>${s.thumb}</b></span>
                        <span style="font-size:13px; color:#555;">Crop: <b>${s.crop}</b></span>
                        <span style="font-size:13px; color:#555;">Cropb: <b>${s.cropb}</b></span>
                    </div>
                    <div>
                        <button class="btn-green" style="padding: 6px 18px; background:#2ed573;" onclick="editImageSlot('${s.slot}')">Edit</button>
                        <button class="btn-danger" style="padding: 6px 14px;" onclick="deleteSlot('${s.slot}')">Delete</button>
                    </div>
                </div>`;
        });
    }

    renderPagination(totalItems, slotsCurrentPage, 'slots', (newPage) => {
        slotsCurrentPage = newPage;
        renderSlotsTable();
    });
}

// 🎯 AUTO CALCULATE AVAILABLE SLOTS (+1 & MISSING/DELETED SLOTS)
function populateSlotDropdown(selectedSlot = null) {
    const select = document.getElementById('slot_number_input');
    if (!select) return;
    select.innerHTML = '';

    const existingNums = globalSlotsList.map(s => parseInt(s.slot, 10)).filter(n => !isNaN(n));
    const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 0;
    
    let availableNums = [];
    
    // 1. අඩුවී ඇති / Delete වූ Numbers සෙවීම (Gaps)
    for (let i = 1; i < maxNum; i++) {
        if (!existingNums.includes(i)) {
            availableNums.push(i);
        }
    }
    
    // 2. ඊළඟ (+1) අලුත් Number එක එකතු කිරීම
    const nextNum = maxNum + 1;
    availableNums.push(nextNum);

    // 3. Dropdown එක පිරවීම
    availableNums.forEach(num => {
        const numStr = num < 10 ? `0${num}` : `${num}`;
        const opt = document.createElement('option');
        opt.value = numStr;
        opt.textContent = `Slot ${numStr}` + (num === nextNum ? ' (Next +1)' : ' (Deleted / Free)');
        if (selectedSlot && selectedSlot === numStr) opt.selected = true;
        else if (!selectedSlot && num === nextNum) opt.selected = true; // Default selects Next +1
        select.appendChild(opt);
    });
}

// 🎯 OPEN EDITOR FOR NEW SLOT
function openNewSlotEditor() {
    document.getElementById('slotEditorTitle').innerText = "Add New Image Slot";
    
    // Dropdown එක Auto Calculate වී පිරවේ
    populateSlotDropdown();
    
    const slotInput = document.getElementById('slot_number_input');
    slotInput.disabled = false;

    document.getElementById('slot_thumb_file').value = '';
    document.getElementById('slot_crop_file').value = '';
    document.getElementById('slot_cropb_file').value = '';

    const editor = document.getElementById('slotEditorSection');
    if (editor) {
        editor.style.display = 'block';
        editor.scrollIntoView({ behavior: 'smooth' });
    }
}

// 🎯 OPEN EDITOR FOR EDITING EXISTING SLOT
function editImageSlot(slotNo) {
    document.getElementById('slotEditorTitle').innerText = `Edit Image Slot: image_${slotNo}`;
    
    const select = document.getElementById('slot_number_input');
    select.innerHTML = `<option value="${slotNo}">Slot ${slotNo}</option>`;
    select.value = slotNo;
    select.disabled = true; // Edit කරද්දී වෙනස් කිරීමට නොහැකි ලෙස Lock වේ

    document.getElementById('slot_thumb_file').value = '';
    document.getElementById('slot_crop_file').value = '';
    document.getElementById('slot_cropb_file').value = '';

    const editor = document.getElementById('slotEditorSection');
    if (editor) {
        editor.style.display = 'block';
        editor.scrollIntoView({ behavior: 'smooth' });
    }
}

async function submitSlotImages() {
    let slotNo = document.getElementById('slot_number_input').value.trim();
    if (!slotNo) return alert("❌ කරුණාකර Slot Number එකක් ඇතුළත් කරන්න (උදා: 07).");

    if (slotNo.length === 1) slotNo = `0${slotNo}`;

    const thumbFile = document.getElementById('slot_thumb_file').files[0];
    const cropFile = document.getElementById('slot_crop_file').files[0];
    const cropbFile = document.getElementById('slot_cropb_file').files[0];

    if (!thumbFile && !cropFile && !cropbFile) {
        return alert("❌ කරුණාකර අවම වශයෙන් එක රූපයක්වත් තෝරන්න.");
    }

    const formData = new FormData();
    // 🎯 slot_no එක අනිවාර්යයෙන්ම Files වලට ඉහළින්ම Append විය යුතුය!
    formData.append("slot_no", slotNo);
    
    if (thumbFile) formData.append("thumb_file", thumbFile);
    if (cropFile) formData.append("crop_file", cropFile);
    if (cropbFile) formData.append("cropb_file", cropbFile);

    try {
        const res = await fetch('/api/slots/upload', { method: 'POST', body: formData });
        const result = await res.json();

        if (result.success) {
            alert(`✅ Slot ${slotNo} පින්තූර සාර්ථකව CardApp හි \\web_images වෙත යාවත්කාලීන විය!`);
            document.getElementById('slotEditorSection').style.display = 'none';
            loadSlotsList();
        } else {
            alert("❌ දෝෂයක් සිදු විය: " + (result.error || "Upload failed"));
        }
    } catch (err) {
        console.error("Slot upload error:", err);
        alert("❌ සර්වර් සම්බන්ධතා දෝෂයක්!");
    }
}

// 🎯 DELETE ENTIRE SLOT FUNCTION
async function deleteSlot(slotNo) {
    if (confirm(`Are you sure you want to delete all files for image_${slotNo}?`)) {
        try {
            const res = await fetch(`/api/slots/${slotNo}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) {
                alert(`✅ image_${slotNo} සාර්ථකව මකා දමන ලදී!`);
                loadSlotsList();
            } else {
                alert("❌ මකාදැමීමට නොහැකි වුණා.");
            }
        } catch (err) {
            console.error("Delete slot error:", err);
            alert("❌ සර්වර් සම්බන්ධතා දෝෂයක්!");
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadCardsList();
});
