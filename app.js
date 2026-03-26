// ================= KHỞI TẠO DỮ LIỆU & CONFIG =================
const STORAGE_KEY = 'vaultSecureData';

let appData = {
    groups: [
        { id: 'group-1', name: 'Facebook', accounts: [] },
        { id: 'group-2', name: 'Google', accounts: [] },
        { id: 'group-3', name: 'Khác', accounts: [] }
    ],
    genOptions: { length: 12, upper: true, number: true, symbol: true }
};

let vaultConfig = JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
let sessionKey = sessionStorage.getItem('vaultSessionKey') || null;

let lockoutStatus = (vaultConfig && vaultConfig.lockout) ? vaultConfig.lockout : { attempts: 0, lockUntil: 0 };
let lockoutInterval = null;

let groupModalEl, accountModalEl, securityModalEl;
let currentGroupId = null;

document.addEventListener('DOMContentLoaded', () => {
    groupModalEl = new bootstrap.Modal(document.getElementById('groupModal'));
    accountModalEl = new bootstrap.Modal(document.getElementById('accountModal'));
    
    // Cài đặt Modal Bảo mật KHÔNG THỂ thoát nếu click ra ngoài hoặc bấm Esc
    securityModalEl = new bootstrap.Modal(document.getElementById('securityModal'), {
        backdrop: 'static',
        keyboard: false
    });
    
    // Tự động tạo giao diện Cảnh báo khóa
    const unlockContainer = document.getElementById('unlock-pin-container');
    if (unlockContainer && !document.getElementById('lockout-msg')) {
        unlockContainer.insertAdjacentHTML('beforebegin', `
            <div id="unlock-error-msg" class="text-danger mb-3 d-none fw-bold text-center"></div>
            <div id="lockout-msg" class="alert alert-danger d-none mb-4 text-center w-100" style="max-width: 320px;">
                <i class="fa-solid fa-triangle-exclamation me-2"></i>
                Nhập sai quá nhiều lần. <br> 
                Thử lại sau: <span id="lockout-timer" class="fw-bold fs-5">00:00</span>
            </div>
        `);
    }

    if (!document.getElementById('vault-dynamic-styles')) {
        document.head.insertAdjacentHTML('beforeend', `
            <style id="vault-dynamic-styles">
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    20% { transform: translateX(-6px); }
                    40% { transform: translateX(6px); }
                    60% { transform: translateX(-6px); }
                    80% { transform: translateX(6px); }
                }
                .shake-anim { animation: shake 0.4s ease-in-out; }
            </style>
        `);
    }

    const modalBody = document.querySelector('#securityModal .modal-body');
    if (modalBody && !document.getElementById('modal-error-msg')) {
        modalBody.insertAdjacentHTML('afterbegin', `
            <div id="modal-error-msg" class="alert alert-danger d-none py-2 fw-semibold text-center mb-3"></div>
        `);
    }

    setupPinInputs('unlock-pin-container', (val) => {
        if (val.length === 6) verifyPin(); 
    });
    
    setupPinInputs('old-pin-inputs', (val) => {
        if (val.length === 6) handleOldPinCheck(val); 
    });
    
    setupPinInputs('new-pin-inputs', (val) => {
        if (val.length === 6) document.querySelector('#confirm-pin-inputs .pin-box').focus(); 
    });
    
    setupPinInputs('confirm-pin-inputs', (val) => {
        if (val.length === 6) document.querySelector('#securityModal .btn-primary').focus(); 
    }); 

    initSecurityCheck(); 
});

// ================= CÁC HÀM UI PHỤ TRỢ =================
function showUnlockError(msg) {
    const errEl = document.getElementById('unlock-error-msg');
    const container = document.getElementById('unlock-pin-container');
    if (errEl) { errEl.innerText = msg; errEl.classList.remove('d-none'); }
    if (container) {
        container.classList.remove('shake-anim');
        void container.offsetWidth; 
        container.classList.add('shake-anim');
    }
}
function hideUnlockError() {
    const errEl = document.getElementById('unlock-error-msg');
    if (errEl) errEl.classList.add('d-none');
}
function showModalError(msg) {
    const errEl = document.getElementById('modal-error-msg');
    if (errEl) { errEl.innerText = msg; errEl.classList.remove('d-none'); }
}
function hideModalError() {
    const errEl = document.getElementById('modal-error-msg');
    if (errEl) errEl.classList.add('d-none');
}

// ================= LOGIC KHÓA TẠM THỜI =================
function handleFailedAttempt() {
    lockoutStatus.attempts++;
    let waitTime = 0; 

    if (lockoutStatus.attempts === 3) waitTime = 30; 
    else if (lockoutStatus.attempts === 4) waitTime = 60; 
    else if (lockoutStatus.attempts === 5) waitTime = 300; 
    else if (lockoutStatus.attempts >= 6) waitTime = 900; 

    if (waitTime > 0) {
        lockoutStatus.lockUntil = Date.now() + (waitTime * 1000);
    }
    
    if (vaultConfig) {
        vaultConfig.lockout = lockoutStatus;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(vaultConfig));
    }
    
    if (waitTime > 0) {
        hideUnlockError(); 
        checkLockoutTimer();
    } else {
        showUnlockError(`Mã PIN không đúng! (Đã nhập sai ${lockoutStatus.attempts} lần)`);
    }
}

function checkLockoutTimer() {
    const now = Date.now();
    const msgEl = document.getElementById('lockout-msg');
    const timerEl = document.getElementById('lockout-timer');
    const container = document.getElementById('unlock-pin-container');

    if (lockoutStatus.lockUntil > now) {
        if(msgEl) msgEl.classList.remove('d-none');
        if(container) {
            container.classList.add('opacity-50');
            container.style.pointerEvents = 'none';
            container.querySelectorAll('input').forEach(i => i.blur()); 
        }

        if (lockoutInterval) clearInterval(lockoutInterval);
        lockoutInterval = setInterval(() => {
            const timeLeft = Math.ceil((lockoutStatus.lockUntil - Date.now()) / 1000);
            if (timeLeft <= 0) {
                clearInterval(lockoutInterval);
                checkLockoutTimer(); 
            } else {
                const mins = Math.floor(timeLeft / 60);
                const secs = timeLeft % 60;
                if(timerEl) timerEl.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        }, 1000);
        return true; 
    } else {
        if(msgEl) msgEl.classList.add('d-none');
        if(container) {
            container.classList.remove('opacity-50');
            container.style.pointerEvents = 'auto';
        }
        if (lockoutInterval) clearInterval(lockoutInterval);
        return false; 
    }
}

// ================= LƯU TRỮ & MÃ HÓA (AES-256) =================
function saveData() {
    let payloadToSave = appData;
    
    if (sessionKey) {
        payloadToSave = CryptoJS.AES.encrypt(JSON.stringify(appData), sessionKey).toString();
    }

    const configToSave = {
        hasPin: !!sessionKey,
        lockout: lockoutStatus, 
        payload: payloadToSave
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(configToSave));
    vaultConfig = configToSave; 
    
    toggleLockButton(); 
    
    if(!document.getElementById('lock-screen').classList.contains('d-none')) return;
    renderGroups();
}

function decryptData(pin) {
    try {
        const bytes = CryptoJS.AES.decrypt(vaultConfig.payload, pin);
        const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedString) return false;
        appData = JSON.parse(decryptedString); 
        return true;
    } catch (e) {
        return false;
    }
}

// ================= HÀM KHÓA ỨNG DỤNG =================
function lockApp() {
    if (!vaultConfig || !vaultConfig.hasPin) return;

    sessionKey = null;
    sessionStorage.removeItem('vaultSessionKey');
    sessionStorage.removeItem('vaultIsAuthenticated');

    appData = {
        groups: [],
        genOptions: { length: 12, upper: true, number: true, symbol: true }
    };
    currentGroupId = null;

    document.getElementById('lock-screen').classList.remove('d-none');
    clearPinValue('unlock-pin-container');
    hideUnlockError();
    toggleLockButton();
    checkLockoutTimer(); 
}

function toggleLockButton() {
    const btnLock = document.getElementById('btn-lock');
    if (btnLock) {
        if (vaultConfig && vaultConfig.hasPin && sessionKey) {
            btnLock.classList.remove('d-none');
            btnLock.classList.add('d-flex'); 
        } else {
            btnLock.classList.add('d-none');
            btnLock.classList.remove('d-flex');
        }
    }
}

// ================= KIỂM TRA BẢO MẬT =================
function initSecurityCheck() {
    checkLockoutTimer(); 

    if (!vaultConfig || !vaultConfig.hasPin) {
        // Nếu khởi chạy lần đầu: Bắt buộc gọi Modal tạo PIN
        showSecurityModal();
    } else {
        if (sessionKey && decryptData(sessionKey)) {
            toggleLockButton();
            loadGenOptions();
            renderGroups();
        } else {
            document.getElementById('lock-screen').classList.remove('d-none');
            if (!checkLockoutTimer()) {
                document.querySelector('#unlock-pin-container .pin-box').focus();
            }
        }
    }
}

function verifyPin() {
    if (checkLockoutTimer()) return; 

    const pin = getPinValue('unlock-pin-container');
    if (pin.length !== 6) return;

    if (decryptData(pin)) {
        document.getElementById('lock-screen').classList.add('d-none');
        sessionKey = pin;
        sessionStorage.setItem('vaultSessionKey', pin);
        clearPinValue('unlock-pin-container');
        hideUnlockError();
        
        lockoutStatus = { attempts: 0, lockUntil: 0 };

        toggleLockButton();
        loadGenOptions();
        saveData(); 
    } else {
        clearPinValue('unlock-pin-container');
        handleFailedAttempt();
    }
}

// ================= QUẢN LÝ MÃ PIN =================
function getPinValue(containerId) {
    const container = document.getElementById(containerId);
    if(!container) return "";
    const inputs = container.querySelectorAll('.pin-box');
    return Array.from(inputs).map(input => input.value).join('');
}

function clearPinValue(containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;
    const inputs = container.querySelectorAll('.pin-box');
    inputs.forEach(input => input.value = '');
    if(inputs.length > 0) inputs[0].focus();
}

function setupPinInputs(containerId, onComplete) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inputs = container.querySelectorAll('.pin-box');
    
    inputs.forEach((input, index) => {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/[^0-9]/g, '');
            
            if (containerId === 'unlock-pin-container') hideUnlockError();
            hideModalError(); 
            if(containerId === 'old-pin-inputs') resetOldPinValidation();

            if (input.value) {
                if (index < inputs.length - 1) {
                    inputs[index + 1].focus();
                } else {
                    if(typeof onComplete === 'function') {
                        setTimeout(() => onComplete(getPinValue(containerId)), 50);
                    }
                }
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                if(containerId === 'old-pin-inputs') resetOldPinValidation();
                if (containerId === 'unlock-pin-container') hideUnlockError();
                hideModalError();

                if (!input.value && index > 0) {
                    e.preventDefault();
                    inputs[index - 1].value = '';
                    inputs[index - 1].focus();
                }
            } else if (e.key === 'Enter' && containerId === 'unlock-pin-container') {
                verifyPin();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
            if (containerId === 'unlock-pin-container') hideUnlockError();
            hideModalError();

            for(let i = 0; i < pastedData.length; i++) {
                if(inputs[index + i]) {
                    inputs[index + i].value = pastedData[i];
                    if(index + i < inputs.length - 1) {
                        inputs[index + i + 1].focus();
                    } else if (index + i === inputs.length - 1) {
                        inputs[index + i].focus();
                        if(typeof onComplete === 'function') setTimeout(() => onComplete(getPinValue(containerId)), 50);
                    }
                }
            }
        });
    });
}

function resetOldPinValidation() {
    const inputs = document.querySelectorAll('#old-pin-inputs .pin-box');
    inputs.forEach(inp => {
        inp.classList.remove('border-success', 'border-danger', 'text-success', 'text-danger');
    });
}

function handleOldPinCheck(val) {
    const inputs = document.querySelectorAll('#old-pin-inputs .pin-box');
    if (val === sessionKey) {
        inputs.forEach(inp => {
            inp.classList.remove('border-danger', 'text-danger');
            inp.classList.add('border-success', 'text-success');
        });
        document.querySelector('#new-pin-inputs .pin-box').focus();
    } else {
        inputs.forEach(inp => {
            inp.classList.remove('border-success', 'text-success');
            inp.classList.add('border-danger', 'text-danger');
        });
    }
}

function showSecurityModal() {
    clearPinValue('old-pin-inputs');
    clearPinValue('new-pin-inputs');
    clearPinValue('confirm-pin-inputs'); 
    resetOldPinValidation();
    hideModalError();
    
    // Kiểm tra có phải lần đầu không
    const isFirstRun = (!vaultConfig || !vaultConfig.hasPin);

    if (isFirstRun) {
        document.getElementById('old-pin-container').classList.add('d-none');
        document.getElementById('btn-close-security').classList.add('d-none'); // Khóa nút X
    } else {
        document.getElementById('old-pin-container').classList.remove('d-none');
        document.getElementById('btn-close-security').classList.remove('d-none'); // Mở nút X
    }
    
    securityModalEl.show();
}

function saveSecurityPin() {
    const oldPin = getPinValue('old-pin-inputs');
    const newPin = getPinValue('new-pin-inputs');
    const confirmPin = getPinValue('confirm-pin-inputs');
    const isFirstRun = (!vaultConfig || !vaultConfig.hasPin);

    // Nếu không phải lần đầu, bắt buộc kiểm tra mã PIN cũ
    if (!isFirstRun && oldPin !== sessionKey) {
        showModalError("Mã PIN hiện tại không chính xác!");
        clearPinValue('old-pin-inputs');
        return;
    }

    if (newPin.length !== 6) {
        showModalError("Vui lòng nhập ĐÚNG 6 CHỮ SỐ cho mã PIN mới!");
        clearPinValue('new-pin-inputs');
        clearPinValue('confirm-pin-inputs');
        return;
    }

    if (newPin !== confirmPin) {
        showModalError("Mã PIN xác nhận không khớp! Vui lòng kiểm tra lại.");
        clearPinValue('confirm-pin-inputs');
        return;
    }

    sessionKey = newPin;
    sessionStorage.setItem('vaultSessionKey', newPin);
    
    saveData(); 
    securityModalEl.hide();
    
    // Nếu là lần đầu chạy, tự động mở giao diện ứng dụng sau khi lưu thành công
    if (isFirstRun) {
        document.getElementById('btn-close-security').classList.remove('d-none'); 
        loadGenOptions();
        renderGroups();
    }
}

// ================= CÁC CHỨC NĂNG CRUD CÒN LẠI =================
function showGroupModal(id = null) {
    const title = document.getElementById('groupModalTitle');
    const nameInput = document.getElementById('groupName');
    const idInput = document.getElementById('groupId');

    if (id) {
        const group = appData.groups.find(g => g.id === id);
        title.innerText = "Sửa Nhóm";
        nameInput.value = group.name;
        idInput.value = group.id;
    } else {
        title.innerText = "Thêm Nhóm Mới";
        nameInput.value = "";
        idInput.value = "";
    }
    groupModalEl.show();
}

function saveGroup() {
    const name = document.getElementById('groupName').value.trim();
    const id = document.getElementById('groupId').value;

    if (!name) return alert("Vui lòng nhập tên nhóm!");

    if (id) {
        const group = appData.groups.find(g => g.id === id);
        group.name = name;
    } else {
        appData.groups.push({ id: Date.now().toString(), name: name, accounts: [] });
    }
    saveData();
    groupModalEl.hide();
}

function deleteGroup(id) {
    if (confirm("Bạn có chắc muốn xóa nhóm này và TOÀN BỘ tài khoản bên trong?")) {
        appData.groups = appData.groups.filter(g => g.id !== id);
        saveData();
    }
}

function showAccountModal(groupId, accId = null) {
    document.getElementById('accGroupId').value = groupId;
    const title = document.getElementById('accountModalTitle');
    const usernameInput = document.getElementById('accUsername');
    const passInput = document.getElementById('accPassword');
    const idInput = document.getElementById('accountId');

    if (accId) {
        const group = appData.groups.find(g => g.id === groupId);
        const acc = group.accounts.find(a => a.id === accId);
        title.innerText = "Sửa Tài Khoản";
        usernameInput.value = acc.username;
        passInput.value = acc.password;
        idInput.value = acc.id;
    } else {
        title.innerText = "Thêm Tài Khoản";
        usernameInput.value = "";
        passInput.value = "";
        idInput.value = "";
    }
    accountModalEl.show();
}

function saveAccount() {
    const groupId = document.getElementById('accGroupId').value;
    const accId = document.getElementById('accountId').value;
    const username = document.getElementById('accUsername').value.trim();
    const password = document.getElementById('accPassword').value.trim();

    if (!username || !password) return alert("Vui lòng điền đủ thông tin!");

    const group = appData.groups.find(g => g.id === groupId);

    if (accId) {
        const acc = group.accounts.find(a => a.id === accId);
        acc.username = username;
        acc.password = password;
    } else {
        group.accounts.push({ id: Date.now().toString(), username, password });
    }
    saveData();
    accountModalEl.hide();
}

function deleteAccount(groupId, accId) {
    if (confirm("Xóa tài khoản này?")) {
        const group = appData.groups.find(g => g.id === groupId);
        group.accounts = group.accounts.filter(a => a.id !== accId);
        saveData();
    }
}

function copyPassword(password) {
    navigator.clipboard.writeText(password).then(() => {
        const toastEl = document.getElementById('copyToast');
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    }).catch(err => {
        console.error('Lỗi khi copy: ', err);
        alert("Trình duyệt của bạn không hỗ trợ copy tự động!");
    });
}

function loadGenOptions() {
    document.getElementById('genLength').value = appData.genOptions.length;
    document.getElementById('lenValue').innerText = appData.genOptions.length;
    document.getElementById('genUpper').checked = appData.genOptions.upper;
    document.getElementById('genNumber').checked = appData.genOptions.number;
    document.getElementById('genSymbol').checked = appData.genOptions.symbol;
}

function saveGenOptions() {
    appData.genOptions = {
        length: parseInt(document.getElementById('genLength').value),
        upper: document.getElementById('genUpper').checked,
        number: document.getElementById('genNumber').checked,
        symbol: document.getElementById('genSymbol').checked
    };
    saveData();
}

function generatePassword() {
    saveGenOptions();
    const length = appData.genOptions.length;
    const hasUpper = appData.genOptions.upper;
    const hasNumber = appData.genOptions.number;
    const hasSymbol = appData.genOptions.symbol;

    const lowerChars = "abcdefghijklmnopqrstuvwxyz";
    const upperChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numberChars = "0123456789";
    const symbolChars = "!@#$%^&*()_+~|}{[]:;?><,./-=";

    let chars = lowerChars;
    if (hasUpper) chars += upperChars;
    if (hasNumber) chars += numberChars;
    if (hasSymbol) chars += symbolChars;

    let password = "";
    if (hasUpper) password += upperChars[Math.floor(Math.random() * upperChars.length)];
    if (hasNumber) password += numberChars[Math.floor(Math.random() * numberChars.length)];
    if (hasSymbol) password += symbolChars[Math.floor(Math.random() * symbolChars.length)];
    password += lowerChars[Math.floor(Math.random() * lowerChars.length)];

    while (password.length < length) {
        password += chars[Math.floor(Math.random() * chars.length)];
    }

    password = password.split('').sort(() => 0.5 - Math.random()).join('');
    document.getElementById('accPassword').value = password;
}

function openGroup(id) {
    currentGroupId = id;
    renderGroups();
}

function closeGroup() {
    currentGroupId = null;
    renderGroups();
}

function renderGroups() {
    const listEl = document.getElementById('group-list');
    listEl.innerHTML = '';

    if (currentGroupId) {
        const group = appData.groups.find(g => g.id === currentGroupId);
        if (!group) { currentGroupId = null; renderGroups(); return; }

        listEl.className = '';

        let html = `
            <div class="d-flex align-items-center justify-content-between mb-4 bg-white p-3 rounded-4 shadow-sm border">
                <button class="btn btn-light shadow-sm" onclick="closeGroup()">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <h4 class="mb-0 fw-bold text-primary text-truncate">${group.name}</h4>
                <button class="btn btn-success shadow-sm" onclick="showAccountModal('${group.id}')">
                    <i class="fa-solid fa-plus"></i> <span class="d-none d-md-inline">Thêm TK</span>
                </button>
            </div>
        `;

        if (group.accounts.length === 0) {
            html += `
                <div class="text-center text-muted py-5 bg-white rounded-4 shadow-sm border">
                    <i class="fa-solid fa-ghost fs-1 mb-3 text-secondary opacity-50"></i>
                    <h5>Nhóm này chưa có tài khoản</h5>
                </div>`;
        } else {
            html += `<div class="d-flex flex-column gap-3">`;
            group.accounts.forEach(acc => {
                html += `
                    <div class="account-item d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 shadow-sm border-0">
                        <div style="flex: 1;">
                            <strong class="d-block fs-5 text-dark mb-1"><i class="fa-solid fa-user-circle me-2 text-primary"></i>${acc.username}</strong>
                        </div>
                        <div class="password-display flex-grow-1" id="pass-${acc.id}">********</div>
                        <div class="action-btns d-flex justify-content-end">
                            <button class="btn btn-light border shadow-sm" onclick="copyPassword('${acc.password}')" title="Sao chép"><i class="fa-regular fa-copy text-success"></i></button>
                            <button class="btn btn-light border shadow-sm" onclick="togglePass('${acc.id}', '${acc.password}')" title="Ẩn/Hiện"><i class="fa-regular fa-eye text-secondary"></i></button>
                            <button class="btn btn-light border shadow-sm" onclick="showAccountModal('${group.id}', '${acc.id}')" title="Sửa"><i class="fa-solid fa-pen text-primary"></i></button>
                            <button class="btn btn-light border shadow-sm" onclick="deleteAccount('${group.id}', '${acc.id}')" title="Xóa"><i class="fa-solid fa-trash text-danger"></i></button>
                        </div>
                    </div>`;
            });
            html += `</div>`;
        }
        listEl.innerHTML = html;

    } else {
        if (appData.groups.length === 0) {
            listEl.className = '';
            listEl.innerHTML = `
                <div class="text-center text-muted py-5 bg-white rounded-4 shadow-sm border">
                    <i class="fa-solid fa-folder-open fs-1 mb-3 text-secondary opacity-50"></i>
                    <h5>Kho lưu trữ trống</h5>
                    <p>Hãy bấm nút bên dưới để bắt đầu nhé!</p>
                    <button class="btn btn-primary mt-2 shadow-sm" onclick="showGroupModal()">
                        <i class="fa-solid fa-plus me-1"></i> Thêm Nhóm Đầu Tiên
                    </button>
                </div>`;
            return;
        }

        listEl.className = 'row row-cols-2 row-cols-md-3 row-cols-lg-4 g-4';

        appData.groups.forEach(group => {
            const groupHtml = `
                <div class="col">
                    <div class="card h-100 shadow-sm border-0 folder-card position-relative" onclick="openGroup('${group.id}')">
                        <div class="position-absolute top-0 end-0 p-2 z-3" onclick="event.stopPropagation()">
                            <div class="dropdown">
                                <button class="btn btn-sm btn-light bg-transparent border-0 shadow-none rounded-circle d-flex align-items-center justify-content-center" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="width: 32px; height: 32px;">
                                    <i class="fa-solid fa-ellipsis-vertical text-secondary fs-5"></i>
                                </button>
                                <ul class="dropdown-menu dropdown-menu-end shadow border-0 rounded-3">
                                    <li><a class="dropdown-item text-primary py-2" href="#" onclick="event.preventDefault(); showGroupModal('${group.id}')"><i class="fa-solid fa-pen me-2"></i>Sửa tên nhóm</a></li>
                                    <li><a class="dropdown-item text-danger py-2" href="#" onclick="event.preventDefault(); deleteGroup('${group.id}')"><i class="fa-solid fa-trash me-2"></i>Xóa nhóm</a></li>
                                </ul>
                            </div>
                        </div>
                        <div class="card-body d-flex flex-column align-items-center justify-content-center text-center p-3 pt-4">
                            <h5 class="card-title fw-bold text-dark text-truncate w-100 mb-3 fs-4">${group.name}</h5>
                            <span class="badge bg-light text-secondary border px-3 py-2 rounded-pill shadow-sm">${group.accounts.length} tài khoản</span>
                        </div>
                    </div>
                </div>
            `;
            listEl.insertAdjacentHTML('beforeend', groupHtml);
        });

        const addGroupHtml = `
            <div class="col">
                <div class="card h-100 folder-card folder-card-add" onclick="showGroupModal()">
                    <div class="card-body d-flex flex-column align-items-center justify-content-center text-center p-3">
                        <i class="fa-solid fa-plus mb-2" style="font-size: 2rem;"></i>
                        <h5 class="fw-bold mb-0 fs-5">Thêm Nhóm</h5>
                    </div>
                </div>
            </div>
        `;
        listEl.insertAdjacentHTML('beforeend', addGroupHtml);
    }
}

function togglePass(id, password) {
    const el = document.getElementById(`pass-${id}`);
    if (el.innerText === '********') {
        el.innerText = password;
        el.style.letterSpacing = "1px";
    } else {
        el.innerText = '********';
        el.style.letterSpacing = "3px";
    }
}
