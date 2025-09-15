'use strict';


define('forum/register', [
    'translator', 'slugify', 'api', 'bootbox', 'forum/login', 'zxcvbn', 'jquery-form',
], function (translator, slugify, api, bootbox, Login, zxcvbn) {
    const Register = {};
    let validationError = false;
    const successIcon = '';

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
        } else if (username.length > ajaxify.data.maximumUsernameLength) {
            showError(username_notify, '[[error:username-too-long]]');
        } else if (!utils.isUserNameValid(username) || !userslug) {
            showError(username_notify, '[[error:invalid-username]]');
        } else {
            Promise.allSettled([
                api.head(`/users/bySlug/${username}`, {}),
                api.head(`/groups/${username}`, {}),
            ]).then((results) => {
                if (results.every(obj => obj.status === 'rejected')) {
                    showSuccess(username_notify, successIcon);
                } else {
                    showError(username_notify, '[[error:username-taken]]');
                    const suggestion = buildUsernameSuggestion(username);
                    showUsernameSuggestionUI(suggestion);
                }

                callback();
            });
        }
    }

    function buildUsernameSuggestion(requested) {
        const trimmed = (requested || '').trim();
        if (!trimmed) return '';

        // If it already ends with digits, increment them; else append "1"
        const m = trimmed.match(/^(.*?)(\d+)$/);
        if (m) {
            const base = m[1];
            const n = String(parseInt(m[2], 10) + 1);
            return base + n;
        }
        return trimmed + '123';
    }

    function showUsernameSuggestionUI(suggested) {
        console.log('nice');
        const $input = $('#username'); // adjust if your input uses a different id/name
        if (!$input.length || !suggested) return;

        // Remove any previous hint
        $('#username-suggestion-hint').remove();

        const $hint = $(`
            <div id="username-suggestion-hint" class="text-muted" style="margin-top:6px;">
            That username is taken. Try
            <button type="button" id="apply-username-suggestion"
                    class="btn btn-link p-0 align-baseline"
                    aria-label="Use suggested username">${suggested}</button>?
            </div>
        `);

        $hint.insertAfter($input);

        // Fill the input with the suggestion when clicked and focus the field
        $('#apply-username-suggestion').on('click', function () {
            $input.val(suggested).trigger('input').focus();
            // Optional: remove hint after applying
            $('#username-suggestion-hint').remove();
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
