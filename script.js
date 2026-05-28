document.addEventListener('DOMContentLoaded', () => {
    
    // Utilities for mapping categories
    const categoryMap = {
        'facilities': 'อาคารสถานที่ / สภาพแวดล้อม',
        'academic': 'การเรียนการสอน',
        'it': 'ระบบสารสนเทศ / อินเทอร์เน็ต',
        'services': 'บริการของมหาวิทยาลัย',
        'other': 'อื่นๆ'
    };

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
                category: categoryMap[category] || category,
                location,
                description,
                isAnonymous,
                date,
                imageUrl: uploadedImageBase64,
                status: 'pending' // pending, progress, resolved
            };
            
            // Save to Firebase or LocalStorage
            if (typeof firebaseAppInitialized !== 'undefined' && firebaseAppInitialized) {
                firebase.database().ref('complaints/' + id).set(newComplaint).then(() => {
                    finishSubmit();
                }).catch(error => {
                    console.error("Error saving complaint: ", error);
                    alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง");
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
    if (complaintsContainer) {
        loadComplaints();
    }

    function loadComplaints() {
        if (typeof firebaseAppInitialized !== 'undefined' && firebaseAppInitialized) {
            firebase.database().ref('complaints').on('value', (snapshot) => {
                const data = snapshot.val();
                let complaints = [];
                for (let id in data) {
                    complaints.push({ firebaseId: id, ...data[id] });
                }
                // ลำดับจากใหม่ไปเก่า (เนื่องจากคีย์ Firebase อาจเรียงไม่ตรงเป๊ะ)
                complaints.reverse();
                renderDashboard(complaints);
            });
        } else {
            const complaints = JSON.parse(localStorage.getItem('university_complaints')) || [];
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
            card.innerHTML = `
                <div class="complaint-info">
                    <h4>${complaint.title}</h4>
                    <div class="complaint-meta">
                        <span><i class="fa-regular fa-calendar"></i> ${complaint.date}</span>
                        <span><i class="fa-solid fa-tag"></i> ${complaint.category}</span>
                        <span><i class="fa-solid fa-hashtag"></i> ${complaint.id}</span>
                        ${complaint.isAnonymous ? '<span><i class="fa-solid fa-mask"></i> ไม่ระบุตัวตน</span>' : ''}
                    </div>
                    ${complaint.imageUrl ? `<div style="margin-top: 15px;"><img src="${complaint.imageUrl}" style="max-height: 120px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);"></div>` : ''}
                    
                    ${complaint.adminReply ? `
                    <div style="margin-top: 15px; padding: 10px 15px; background: rgba(79, 70, 229, 0.05); border-left: 3px solid var(--primary-color); border-radius: 0 8px 8px 0;">
                        <div style="font-size: 0.75rem; font-weight: 700; color: var(--primary-color); margin-bottom: 4px;"><i class="fa-solid fa-reply"></i> ตอบกลับจากสภาฯ</div>
                        <div style="font-size: 0.85rem; color: #4b5563; white-space: pre-line;">${complaint.adminReply}</div>
                    </div>
                    ` : ''}
                </div>
                <div>
                    ${statusBadge}
                </div>
            `;
            complaintsContainer.appendChild(card);
        });
    }

});
