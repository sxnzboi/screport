document.addEventListener('DOMContentLoaded', () => {
    
    // Utilities for mapping categories
    const categoryMap = {
        'facilities': 'อาคารสถานที่ / สภาพแวดล้อม',
        'academic': 'การเรียนการสอน',
        'it': 'ระบบสารสนเทศ / อินเทอร์เน็ต',
        'services': 'บริการของมหาวิทยาลัย',
        'behavior': 'พฤติกรรมไม่เหมาะสม',
        'other': 'อื่นๆ'
    };

    // SECURITY: Helper to escape HTML and prevent XSS
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Global variable for uploaded image
    let uploadedImageBase64 = null;

    // Expose image upload handler to global scope for HTML inline events
    window.handleImageUpload = function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.type.match('image.*')) {
            alert('กรุณาอัพโหลดไฟล์รูปภาพเท่านั้น');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert('ขนาดไฟล์เกิน 5MB');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                // Compress image
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                uploadedImageBase64 = canvas.toDataURL('image/jpeg', 0.7);
                
                // Show preview
                document.getElementById('imagePreview').src = uploadedImageBase64;
                document.getElementById('imagePreview').style.display = 'block';
                document.getElementById('uploadIcon').style.display = 'none';
                document.getElementById('uploadText').innerText = 'เปลี่ยนรูปภาพ';
                document.getElementById('uploadDesc').style.display = 'none';
            }
            img.src = e.target.result;
        }
        reader.readAsDataURL(file);
    };

    // --- Form Submission Logic (submit.html) ---
    const complaintForm = document.getElementById('complaintForm');
    if (complaintForm) {
        complaintForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Get form values
            const title = document.getElementById('title').value;
            const category = document.getElementById('category').value;
            const location = document.getElementById('location').value;
            const description = document.getElementById('description').value;
            const isAnonymous = document.getElementById('isAnonymous').checked;
            
            // Generate a random mock ID
            const id = 'REQ-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            const date = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
            
            // Create complaint object
            const newComplaint = {
                id,
                title,
                category: category, // เก็บค่า key เพื่อ filter ได้ถูกต้อง
                categoryLabel: categoryMap[category] || category, // เก็บ label สำหรับแสดงผล
                location,
                description,
                isAnonymous,
                date,
                imageUrl: uploadedImageBase64 || null,
                submitterEmail: window.currentUserEmail || '',
                status: 'pending' // pending, progress, resolved
            };
            
            // Save to Firebase or LocalStorage
            if (typeof firebaseAppInitialized !== 'undefined' && firebaseAppInitialized) {
                const { imageUrl, ...complaintWithoutImage } = newComplaint;
                
                // Show loading state on button
                const submitBtn = complaintForm.querySelector('button[type="submit"]');
                const origBtnText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกข้อมูล...';

                // Helper to save complaint to DB
                const saveToDb = (downloadUrl = null) => {
                    const finalComplaint = { ...complaintWithoutImage };
                    if (downloadUrl) {
                        finalComplaint.imageUrl = downloadUrl;
                    }
                    return firebase.database().ref('complaints/' + id).set(finalComplaint);
                };

                let uploadPromise = Promise.resolve(null);
                
                // If there's an image, upload to Storage first
                if (imageUrl) {
                    const storageRef = firebase.storage().ref();
                    const imageRef = storageRef.child('complaints/' + id + '_' + Date.now() + '.jpg');
                    
                    // Upload Base64 string
                    uploadPromise = imageRef.putString(imageUrl, 'data_url')
                        .then(snapshot => snapshot.ref.getDownloadURL());
                }

                uploadPromise
                    .then(downloadUrl => saveToDb(downloadUrl))
                    .then(() => {
                        finishSubmit();
                    })
                    .catch(error => {
                        console.error("Error saving complaint: ", error);
                        console.error("Error code: ", error.code);
                        console.error("Error message: ", error.message);
                        
                        let msg = "เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง";
                        if (error.code === 'PERMISSION_DENIED' || error.code === 'storage/unauthorized') {
                            msg = "ไม่มีสิทธิ์บันทึกข้อมูล กรุณาเข้าสู่ระบบก่อนส่งคำร้องเรียน (หรือติดปัญหา Permission)";
                        } else if (error.message) {
                            msg += "\n(" + error.message + ")";
                        }
                        alert(msg);
                        
                        // Restore button
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = origBtnText;
                    });
            } else {
                let complaints = JSON.parse(localStorage.getItem('university_complaints')) || [];
                complaints.unshift(newComplaint); // Add to beginning
                localStorage.setItem('university_complaints', JSON.stringify(complaints));
                finishSubmit();
            }
            
            function finishSubmit() {
                // Animate button success state
                const submitBtn = complaintForm.querySelector('button[type="submit"]');
                submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> ส่งข้อมูลสำเร็จ!';
                submitBtn.style.background = 'var(--status-resolved)';
                
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1500);
            }
        });
    }

    // --- Dashboard Logic (dashboard.html) ---
    const complaintsContainer = document.getElementById('complaintsContainer');
    let currentComplaints = [];
    let complaintsChartInstance = null;
    
    if (complaintsContainer) {
        loadComplaints();
        
        const chartFilter = document.getElementById('chartFilter');
        if (chartFilter) {
            chartFilter.addEventListener('change', () => {
                renderChart(currentComplaints);
            });
        }

        // Listen for auth state changes on dashboard to dynamically update UI for the specific logged in user
        if (typeof firebaseAppInitialized !== 'undefined' && firebaseAppInitialized) {
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    window.currentUserEmail = user.email;
                } else {
                    window.currentUserEmail = null;
                }
                // Re-render dashboard if we already loaded complaints to show/hide user-specific chat buttons
                if (currentComplaints && currentComplaints.length > 0) {
                    renderDashboard(currentComplaints);
                }
            });
        }
    }

    function loadComplaints() {
        if (typeof firebaseAppInitialized !== 'undefined' && firebaseAppInitialized) {
            // SECURITY & PERF: ดึงข้อมูลแค่ 50 รายการล่าสุด ป้องกันการโหลดหนัก
            firebase.database().ref('complaints').orderByKey().limitToLast(50).on('value', (snapshot) => {
                const data = snapshot.val();
                let complaints = [];
                for (let id in data) {
                    complaints.push({ firebaseId: id, ...data[id] });
                }
                // SECURITY: filter to only show current user's own complaints
                if (window.currentUserEmail) {
                    complaints = complaints.filter(c => c.submitterEmail === window.currentUserEmail);
                }
                complaints.reverse();
                currentComplaints = complaints;
                renderDashboard(complaints);
            });
        } else {
            const complaints = JSON.parse(localStorage.getItem('university_complaints')) || [];
            currentComplaints = complaints;
            renderDashboard(complaints);
        }
    }

    function renderDashboard(complaints) {
        
        // Update Stats
        const total = complaints.length;
        const pending = complaints.filter(c => c.status === 'pending').length;
        const resolved = complaints.filter(c => c.status === 'resolved').length;
        const cancelled = complaints.filter(c => c.status === 'cancelled').length;
        
        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-resolved').textContent = resolved;
        if (document.getElementById('stat-cancelled')) {
            document.getElementById('stat-cancelled').textContent = cancelled;
        }
        
        // Render Chart
        renderChart(complaints);
        
        // Render List
        if (complaints.length === 0) {
            complaintsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-folder-open"></i>
                    <h4>ยังไม่มีเรื่องร้องเรียน</h4>
                    <p>คุณยังไม่ได้แจ้งเรื่องร้องเรียนใดๆ ในระบบ</p>
                </div>
            `;
            return;
        }
        
        complaintsContainer.innerHTML = '';
        complaints.forEach(complaint => {
            
            let statusBadge = '';
            if (complaint.status === 'pending') {
                statusBadge = '<span class="status-tag status-pending">รอดำเนินการ</span>';
            } else if (complaint.status === 'progress') {
                statusBadge = '<span class="status-tag status-progress">กำลังดำเนินการ</span>';
            } else if (complaint.status === 'resolved') {
                statusBadge = '<span class="status-tag status-resolved">แก้ไขแล้ว</span>';
            } else {
                statusBadge = '<span class="status-tag status-cancelled">คำขอถูกยกเลิก</span>';
            }

            const card = document.createElement('div');
            card.className = 'complaint-card';

            // Only show the chat button if the current user is the owner/submitter of this complaint
            const isMyComplaint = window.currentUserEmail && complaint.submitterEmail === window.currentUserEmail;
            const safeFirebaseId = escapeHtml(complaint.firebaseId);
            const titleEncoded = encodeURIComponent(complaint.title || '');
            const chatButtonHTML = isMyComplaint ? `
                <button data-id="${safeFirebaseId}" data-title="${titleEncoded}" onclick="openChatFromCard(this)" class="btn btn-primary" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 12px; background: rgba(79,70,229,0.1); color: var(--primary-color); border: 1px solid rgba(79,70,229,0.2); box-shadow: none;">
                    <i class="fa-solid fa-comments"></i> แชท
                </button>
            ` : '';

            card.innerHTML = `
                <div class="complaint-info">
                    <h4>${escapeHtml(complaint.title)}</h4>
                    <div class="complaint-meta">
                        <span><i class="fa-regular fa-calendar"></i> ${escapeHtml(complaint.date)}</span>
                        <span><i class="fa-solid fa-tag"></i> ${escapeHtml(complaint.category)}</span>
                        <span><i class="fa-solid fa-hashtag"></i> ${escapeHtml(complaint.id)}</span>
                        ${complaint.isAnonymous ? '<span><i class="fa-solid fa-mask"></i> ไม่ระบุตัวตน</span>' : ''}
                    </div>
                    ${complaint.imageUrl ? `<div style="margin-top: 15px;"><img src="${escapeHtml(complaint.imageUrl)}" style="max-height: 120px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);"></div>` : ''}
                    
                    ${complaint.adminReply ? `
                    <div style="margin-top: 15px; padding: 10px 15px; background: rgba(79, 70, 229, 0.05); border-left: 3px solid var(--primary-color); border-radius: 0 8px 8px 0;">
                        <div style="font-size: 0.75rem; font-weight: 700; color: var(--primary-color); margin-bottom: 4px;"><i class="fa-solid fa-reply"></i> ตอบกลับจากสภาฯ</div>
                        <div style="font-size: 0.85rem; color: #4b5563; white-space: pre-line;">${escapeHtml(complaint.adminReply)}</div>
                    </div>
                    ` : ''}
                </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
                    ${statusBadge}
                    ${chatButtonHTML}
                </div>
            `;
            complaintsContainer.appendChild(card);
        });
    }

    function renderChart(complaints) {
        const ctx = document.getElementById('complaintsChart');
        const filterElement = document.getElementById('chartFilter');
        
        if (!ctx || !filterElement || typeof Chart === 'undefined') return;
        
        const filterBy = filterElement.value;
        let labels = [];
        let data = [];
        let backgroundColors = [];
        let borderColors = [];

        if (filterBy === 'status') {
            labels = ['รอดำเนินการ', 'กำลังดำเนินการ', 'แก้ไขแล้ว', 'ยกเลิก'];
            const pending = complaints.filter(c => c.status === 'pending').length;
            const progress = complaints.filter(c => c.status === 'progress').length;
            const resolved = complaints.filter(c => c.status === 'resolved').length;
            const cancelled = complaints.filter(c => c.status === 'cancelled').length;
            
            data = [pending, progress, resolved, cancelled];
            
            // Map colors to match the app theme
            backgroundColors = [
                'rgba(245, 158, 11, 0.8)', // pending
                'rgba(59, 130, 246, 0.8)',  // progress
                'rgba(16, 185, 129, 0.8)',  // resolved
                'rgba(239, 68, 68, 0.8)'   // cancelled
            ];
        } else if (filterBy === 'category') {
            // Tally up categories dynamically
            const categoryCounts = {};
            complaints.forEach(c => {
                const cat = c.category || 'อื่นๆ';
                categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            });
            
            labels = Object.keys(categoryCounts);
            data = Object.values(categoryCounts);
            
            // Distinct colors for categories
            const colorPalette = [
                'rgba(99, 102, 241, 0.8)',
                'rgba(236, 72, 153, 0.8)',
                'rgba(14, 165, 233, 0.8)',
                'rgba(168, 85, 247, 0.8)',
                'rgba(249, 115, 22, 0.8)',
                'rgba(20, 184, 166, 0.8)'
            ];
            backgroundColors = labels.map((_, i) => colorPalette[i % colorPalette.length]);
        }
        
        // Ensure there is data to show, otherwise provide a fallback empty state in the chart
        const totalItems = data.reduce((sum, val) => sum + val, 0);
        if (totalItems === 0) {
            labels = ['ไม่มีข้อมูล'];
            data = [1];
            backgroundColors = ['rgba(0, 0, 0, 0.05)'];
        }

        if (complaintsChartInstance) {
            complaintsChartInstance.destroy();
        }

        complaintsChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: backgroundColors,
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { family: "'Kanit', sans-serif", size: 12 },
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        titleFont: { family: "'Kanit', sans-serif" },
                        bodyFont: { family: "'Kanit', sans-serif", size: 14 },
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    if (totalItems === 0) {
                                        label += '0 รายการ';
                                    } else {
                                        label += context.parsed + ' รายการ';
                                    }
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    /* =========================================
       Chat System Logic (User / Dashboard)
       ========================================= */
    let currentChatId = null;
    let chatListenerRef = null;

    window.openChat = function(complaintId, title) {
        if (!window.currentUserEmail) {
            alert('กรุณาเข้าสู่ระบบก่อนใช้งานแชท');
            window.location.href = 'user-login.html?redirect=dashboard.html';
            return;
        }

        currentChatId = complaintId;
        const modal = document.getElementById('chatModalOverlay');
        const messagesContainer = document.getElementById('chatMessages');

        // Update title with complaint name
        const modalTitle = document.getElementById('chatModalTitle');
        if (modalTitle) modalTitle.textContent = 'สภานักศึกษา';
        
        let subtitleEl = document.getElementById('chatModalSubtitle');
        if (!subtitleEl && modalTitle) {
            subtitleEl = document.createElement('span');
            subtitleEl.id = 'chatModalSubtitle';
            subtitleEl.style = 'font-size: 0.7rem; font-weight: 400; color: var(--text-muted); display: block; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;';
            modalTitle.parentNode.appendChild(subtitleEl);
        }
        if (subtitleEl) subtitleEl.textContent = 'เรื่อง: ' + title;

        if (messagesContainer) messagesContainer.innerHTML = '<div style="text-align:center; padding: 30px 20px; color: var(--text-muted); font-size: 0.85rem;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 10px; display: block;"></i>กำลังโหลดข้อความ...</div>';
        if (modal) modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        if (chatListenerRef) chatListenerRef.off('child_added');

        if (typeof firebaseAppInitialized !== 'undefined' && firebaseAppInitialized) {
            if (messagesContainer) messagesContainer.innerHTML = '';
            // Fetch the complaint first to verify that the current user owns it (Security check)
            firebase.database().ref('complaints/' + complaintId).once('value').then((snap) => {
                const compData = snap.val();
                if (!compData || compData.submitterEmail !== window.currentUserEmail) {
                    alert('คุณไม่มีสิทธิ์เข้าถึงห้องแชทของเรื่องร้องเรียนนี้');
                    window.closeChat();
                    return;
                }
                
                // User owns this complaint, allow establishing the real-time chat listener
                chatListenerRef = firebase.database().ref('chats/' + complaintId);
                chatListenerRef.on('child_added', (snapshot) => {
                    appendChatMessage(snapshot.val());
                });
            }).catch(err => {
                console.error("Error verifying chat ownership:", err);
                alert('เกิดข้อผิดพลาดในการเปิดแชท');
                window.closeChat();
            });
        }
    };

    window.closeChat = function() {
        const modal = document.getElementById('chatModalOverlay');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
        if (chatListenerRef) {
            chatListenerRef.off('child_added');
            chatListenerRef = null;
        }
        currentChatId = null;
    };

    // Close on overlay click
    const chatOverlay = document.getElementById('chatModalOverlay');
    if (chatOverlay) {
        chatOverlay.addEventListener('click', function(e) {
            if (e.target === this) window.closeChat();
        });
    }

    window.sendChatMessage = function() {
        const input = document.getElementById('chatInput');
        const text = input ? input.value.trim() : '';
        const btn = document.getElementById('chatSendBtn');
        if (!text || !currentChatId) return;

        if (input) input.disabled = true;
        if (btn) btn.disabled = true;

        const msgData = {
            sender: window.currentUserEmail,
            text: text,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        firebase.database().ref('chats/' + currentChatId).push(msgData)
            .then(() => {
                if (input) {
                    input.value = '';
                    input.disabled = false;
                    input.focus();
                }
                if (btn) btn.disabled = false;
            })
            .catch(error => {
                console.error('Error sending message:', error);
                alert('ไม่สามารถส่งข้อความได้ กรุณาลองใหม่');
                if (input) input.disabled = false;
                if (btn) btn.disabled = false;
            });
    };

    function appendChatMessage(msg) {
        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer) return;
        const wrapper = document.createElement('div');

        const isMe = msg.sender === window.currentUserEmail;
        wrapper.className = `chat-message-wrapper ${isMe ? 'sent' : 'received'}`;

        const timeString = msg.timestamp
            ? new Date(msg.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
            : '';
        const senderName = isMe ? 'คุณ' : (msg.sender === 'admin' ? 'สภานักศึกษา' : msg.sender);

        wrapper.innerHTML = `
            ${!isMe ? `<div class="chat-sender-name">${senderName}</div>` : ''}
            <div class="chat-message">${msg.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            <span class="chat-meta">${timeString}</span>
        `;

        messagesContainer.appendChild(wrapper);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Helper: open chat from card button's data-attributes (XSS-safe)
    window.openChatFromCard = function(btn) {
        const id = btn.getAttribute('data-id');
        const title = decodeURIComponent(btn.getAttribute('data-title') || '');
        openChat(id, title);
    };

    // Also close chat on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') window.closeChat();
    });

});
