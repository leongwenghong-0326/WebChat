<?php
declare(strict_types=1);
?>
<?php if (current_admin_id()): ?>
</main>
</div>
<?php endif; ?>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
(function () {
    var toggle = document.getElementById('btnSidebarToggle');
    var backdrop = document.getElementById('sidebarBackdrop');
    if (toggle) toggle.addEventListener('click', function () {
        document.body.classList.toggle('wc-sidebar-open');
    });
    if (backdrop) backdrop.addEventListener('click', function () {
        document.body.classList.remove('wc-sidebar-open');
    });
})();
</script>
</body>
</html>