document.getElementById('emailForm').addEventListener('submit', function(e) {
  const container = this.querySelector('.form-container');
  const confirmMsg = this.querySelector('#confirmMsg');
  setTimeout(function() {
    container.style.display = 'none';
    confirmMsg.style.display = 'block';
  }, 500);
});

document.getElementById('emailForm2').addEventListener('submit', function(e) {
  const container = this.querySelector('.form-container');
  const confirmMsg = this.querySelector('#confirmMsg2');
  setTimeout(function() {
    container.style.display = 'none';
    confirmMsg.style.display = 'block';
  }, 500);
});
