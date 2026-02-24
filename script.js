document.getElementById('emailForm').addEventListener('submit', function() {
  setTimeout(function() {
    document.querySelector('.form-container').style.display = 'none';
    document.getElementById('confirmMsg').style.display = 'block';
  }, 500);
});
