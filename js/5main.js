// ============================================================================
// ENTRY POINT
// ============================================================================
// 
// All data loading and initialization is handled in 2data_manager.js
// This file is reserved for future extensions and global initialization
// if needed.
//
// Script loading order (from index.html):
//   1. 1map_setup.js    - Map initialization and core visualization
//   2. 2data_manager.js - Data loading and processing
//   3. 3layer_logic.js  - Map layer rendering
//   4. 4ui_controls.js  - User interface and interactions
//   5. 5main.js         - Entry point (this file)
// ============================================================================

// ============================================================================
// DATA TABS FUNCTIONALITY (Countries & Wine Regions)
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    var dataTabButtons = document.querySelectorAll('.data-tab-btn');
    
    dataTabButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            var targetTab = this.getAttribute('data-tab');
            
            // Remove active class from all buttons and tabs
            dataTabButtons.forEach(function(btn) {
                btn.classList.remove('active');
            });
            
            document.querySelectorAll('.data-tab-content').forEach(function(content) {
                content.classList.remove('active');
            });
            
            // Add active class to clicked button and corresponding tab
            this.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
});

// ============================================================================
// HELP MODAL FUNCTIONALITY
// ============================================================================

var helpModal = document.getElementById('help-modal');
var helpBtn = document.getElementById('help-btn');
var closeBtn = document.querySelector('.close');

// Open modal when help button is clicked
helpBtn.addEventListener('click', function() {
    helpModal.classList.add('show');
});

// Close modal when close button is clicked
closeBtn.addEventListener('click', function() {
    helpModal.classList.remove('show');
});

// Close modal when clicking outside the modal content
window.addEventListener('click', function(event) {
    if (event.target === helpModal) {
        helpModal.classList.remove('show');
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && helpModal.classList.contains('show')) {
        helpModal.classList.remove('show');
    }
});
