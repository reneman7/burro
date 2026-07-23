<?php

require __DIR__ . '/includes/bootstrap.php';

admin_logout();
header('Location: login.php');
