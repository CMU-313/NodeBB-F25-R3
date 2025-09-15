'use strict';

define('forum/register', [
    'translator', 'slugify', 'api', 'bootbox', 'forum/login', 'zxcvbn', 'jquery-form',
], function (translator, slugify, api, bootbox, Login, zxcvbn) {
    const Register = {};
    let validationError = false;
    const successIcon = '';

    // --- Suggestion helpers (English-only for this recitation task) ---
    const SUG_SUFFIX = 'suffix';
    function suggestUsername(base) {
        // Suggestion is based on the slugified base attempt
        const s = slugify(base || '');
        return s ? (s + SUG_SUFFIX) : '';
    }
    function showUsernameTakenWithSuggestion(element, attempted) {
        const suggestion = suggestUsername(attempted);
        // Build a small inline UI with a clickable suggestion
        translator.translate('[[error:username-taken]]', function (msg) {
            const html = `
                <span>${msg}</span>
                ${suggestion ? ` — <span>Try: </span>
                <button type="button" id="apply-username-suggestion" class="btn btn-link btn-sm p-0 align-baseline">
                    ${utils.escapeHTML(suggestion)}
                </button>` : ''}
            `;
            element.html(html);
            element.parent()
                .removeClass('register-success')
                .addClass('register-danger');
            element.show();

            // Wire the click to apply suggestion & re-validate
            const btn = document.getElementById('apply-username-suggestion');
            if (btn) {
                btn.addEventListener('click', function () {
                    const $username = $('#username');
                    $username.val(suggestion);
                    // Update the "mention you as" preview
                    $('#yourUsername').text(suggestion || 'username');
                    // Trigger re-validation
                    validateUsername($username.val());
                });
            }
        });
        validationError = true;
    }

    Register.init = function () {
        const username = $('#username');
        const password = $('#password');
        const password_confirm = $('#password-confirm');
        const register = $('#register');

        handleLanguageOverride();

        $('#content #noscript').val('false');

        const query = utils.params();
        if (query.token) {
            $('#token').val(query.token);
        }

        // Update the "others can mention you via" text
        username.on('keyup', function () {
            $('#yourUsername').text(this.value.length > 0 ? slugify(this.value) : 'username');
        });

        username.on('blur', function () {
            if (username.val().length) {
                validateUsername(username.val());
            }
        });

        password.on('blur', function () {
            if (password.val().length) {
                validatePassword(password.val(), password_confirm.val());
            }
        });

        password_confirm.on('blur', function () {
            if (password_confirm.val().length) {
                validatePasswordConfirm(password.val(), password_confirm.val());
            }
        });

        function validateForm(callback) {
            validationError = false;
            validatePassword(password.val(), password_confirm.val());
            validatePasswordConfirm(password.val(), password_confirm.val());
            validateUsername(username.val(), callback);
        }

        // Guard against caps lock
        Login.capsLockCheck(document.querySelector('#password'), document.querySelector('#caps-lock-warning'));

        register.on('click', function (e) {
            const registerBtn = $(this);
            const errorEl = $('#register-error-notify');
            errorEl.addClass('hidden');
            e.preventDefault();
            validateForm(function () {
                if (validationError) {
                    return;
                }

                registerBtn.addClass('disabled');

                registerBtn.parents('form').ajaxSubmit({
                    headers: {
                        'x-csrf-token': config.csrf_token,
                    },
                    success: function (data) {
                        registerBtn.removeClass('disabled');
                        if (!data) {
                            return;
                        }
                        if (data.next) {
                            const pathname = utils.urlToLocation(data.next).pathname;

                            const params = utils.params({ url: data.next });
                            params.registered = true;
                            const qs = decodeURIComponent($.param(params));

                            window.location.href = pathname + '?' + qs;
                        } else if (data.message) {
                            translator.translate(data.message, function (msg) {
                                bootbox.alert(msg);
                                ajaxify.go('/');
                            });
                        }
                    },
                    error: function (data) {
                        translator.translate(data.responseText, config.defaultLang, function (translated) {
                            if (data.status === 403 && data.responseText === 'Forbidden') {
                                window.location.href = config.relative_path + '/register?error=csrf-invalid';
                            } else {
                                errorEl.find('p').text(translated);
                                errorEl.removeClass('hidden');
                                registerBtn.removeClass('disabled');
                            }
                        });
                    },
                });
            });
        });

        // Set initial focus
        $('#username').focus();
    };

    function validateUsername(username, callback) {
        callback = callback || function () {};

        const username_notify = $('#username-notify');
        const userslug = slugify(username);
        if (username.length < ajaxify.data.minimumUsernameLength ||
            userslug.length < ajaxify.data.minimumUsernameLength) {
            showError(username_notify, '[[error:username-too-short]]');
            return callback();
        } else if (username.length > ajaxify.data.maximumUsernameLength) {
            showError(username_notify, '[[error:username-too-long]]');
            return callback();
        } else if (!utils.isUserNameValid(username) || !userslug) {
            showError(username_notify, '[[error:invalid-username]]');
            return callback();
        }

        // IMPORTANT: check existence by slug, not raw username
        Promise.allSettled([
            api.head(`/users/bySlug/${userslug}`),
            api.head(`/groups/${userslug}`),
        ]).then((results) => {
            // If both HEADs reject (404), it's available
            if (results.every(obj => obj.status === 'rejected')) {
                showSuccess(username_notify, successIcon);
            } else {
                // Taken: show suggestion inline (English only per task)
                showUsernameTakenWithSuggestion(username_notify, username);
            }
            callback();
        });
    }

    function validatePassword(password, password_confirm) {
        const password_notify = $('#password-notify');
        const password_confirm_notify = $('#password-confirm-notify');

        try {
            utils.assertPasswordValidity(password, zxcvbn);

            if (password === $('#username').val()) {
                throw new Error('[[user:password_same_as_username]]');
            }

            showSuccess(password_notify, successIcon);
        } catch (err) {
            showError(password_notify, err.message);
        }

        if (password !== password_confirm && password_confirm !== '') {
            showError(password_confirm_notify, '[[user:change_password_error_match]]');
        }
    }

    function validatePasswordConfirm(password, password_confirm) {
        const password_notify = $('#password-notify');
        const password_confirm_notify = $('#password-confirm-notify');

        if (!password || password_notify.hasClass('alert-error')) {
            return;
        }

        if (password !== password_confirm) {
            showError(password_confirm_notify, '[[user:change_password_error_match]]');
        } else {
            showSuccess(password_confirm_notify, successIcon);
        }
    }

    function showError(element, msg) {
        translator.translate(msg, function (msg) {
            element.html(msg);
            element.parent()
                .removeClass('register-success')
                .addClass('register-danger');
            element.show();
        });
        validationError = true;
    }

    function showSuccess(element, msg) {
        translator.translate(msg, function (msg) {
            element.html(msg);
            element.parent()
                .removeClass('register-danger')
                .addClass('register-success');
            element.show();
        });
    }

    function handleLanguageOverride() {
        if (!app.user.uid && config.defaultLang !== config.userLang) {
            const formEl = $('[component="register/local"]');
            const langEl = $('<input type="hidden" name="userLang" value="' + config.userLang + '" />');

            formEl.append(langEl);
        }
    }

    return Register;
});
