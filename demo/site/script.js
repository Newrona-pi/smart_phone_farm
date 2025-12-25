document.getElementById('action-btn').addEventListener('click', () => {
    const status = document.getElementById('status-text');
    status.innerText = 'Action Executed!';
    status.style.color = 'green';
    console.log('Button clicked, status updated.');
});
