'use strict';

define('forum/account/edit/username', [
    'forum/account/header', 'api', 'slugify', 'alerts',
], function (header, api, slugify, alerts) {
    const AccountEditUsername = {};
    function suggestUsername(base) {
        // 4-digit number: 1000..9999
        const rand = Math.floor(100 + (Math.random() * 900));
        const withSuffix = `${base}${rand}`;
        return slugify(withSuffix).replace(/-/g, '');
    }

    // Detect “username taken” coming back from API
    function isUsernameTakenError(err) {
        const msg = (err && (err.message || err)) || '';
        console.log('issue');
        return typeof msg === 'string' &&
            (msg.includes('username-taken') || /Username taken/i.test(msg));
    }

    AccountEditUsername.init = function () {
        header.init();

        $('#submitBtn').on('click', function updateUsername() {
            const userData = {
                uid: $('#inputUID').val(),
                username: $('#inputNewUsername').val(),
                password: $('#inputCurrentPassword').val(),
            };

            if (!userData.username) {
                return;
            }

            if (userData.username === userData.password) {
                return alerts.error('[[user:username_same_as_password]]');
            }

            const btn = $(this);
            btn.addClass('disabled').find('i').removeClass('hide');

            api.put('/users/' + userData.uid, userData).then((response) => {
                const userslug = slugify(userData.username);
                if (userData.username && userslug && parseInt(userData.uid, 10) === parseInt(app.user.uid, 10)) {
                    $('[component="header/profilelink"]').attr('href', config.relative_path + '/user/' + userslug);
                    $('[component="header/profilelink/edit"]').attr('href', config.relative_path + '/user/' + userslug + '/edit');
                    $('[component="header/profilelink/settings"]').attr('href', config.relative_path + '/user/' + userslug + '/settings');
                    $('[component="header/username"]').text(userData.username);
                    $('[component="header/usericon"]').css('background-color', response['icon:bgColor']).text(response['icon:text']);
                    $('[component="avatar/icon"]').css('background-color', response['icon:bgColor']).text(response['icon:text']);
                }

                ajaxify.go('user/' + userslug + '/edit');
            }).catch((err) => {
                console.log('API error payload:', err);
                if (isUsernameTakenError(err)) {
                    const base = $('#inputNewUsername').val().trim();
                    const suggestion = suggestUsername(base);
                    $('#inputNewUsername').val(suggestion).focus().select();
                    alerts.alert('[[user:username_suggestion, ' + suggestion + ']]');
                    return;
                } return alerts.error(err);
            }).finally(() => {
                btn.removeClass('disabled').find('i').addClass('hide');
            });

            return false;
        });
    };

    return AccountEditUsername;
});
