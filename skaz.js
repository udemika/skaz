(function () {
    'use strict';

    function SkazLite(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);

        var sources = {};
        var current_source = '';
        var active_source_name = '';

        var filter_items = {
            season: [],
            voice: []
        };

        // Лучше начинать с CORS-прокси, чтобы не ловить CORS-block в браузере
        var PROXIES = [
            'https://cors557.deno.dev/',
            'https://apn5.akter-black.com/',
            'https://apn10.akter-black.com/',
            'https://apn7.akter-black.com/',
            'https://apn6.akter-black.com/',
            'https://apn2.akter-black.com/'
        ];

        var MIRRORS = [
            'http://online3.skaz.tv/',
            'http://online7.skaz.tv/',
            'http://onlinecf3.skaz.tv/'
        ];

        var SETTINGS = {
            email: 'aklama@mail.ru',
            uid: 'guest',
            current_mirror: MIRRORS[0],
            current_proxy: PROXIES[0]
        };

        var DEFAULT_BALANSERS = [
            { name: 'VideoCDN', balanser: 'videocdn' },
            { name: 'Alloha', balanser: 'alloha' },
            { name: 'Collaps', balanser: 'collaps' },
            { name: 'RHS Premium', balanser: 'rhsprem' },
            { name: 'Rezka', balanser: 'rezka' },
            { name: 'Filmix', balanser: 'filmix' },
            { name: 'Ashdi', balanser: 'ashdi' },
            { name: 'Kinogo', balanser: 'kinogo' },
            { name: 'Zetflix', balanser: 'zetflix' },
            { name: 'HDVB', balanser: 'hdvb' },
            { name: 'Kodik', balanser: 'kodik' }
        ];

        function log(msg, data) {
            console.log('[SkazLite]', msg, data || '');
        }

        function rotateProxy() {
            SETTINGS.current_proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
            log('Switched proxy to:', SETTINGS.current_proxy);
        }

        // ============ PROXY FUNCTIONS ============
        this.clearProxy = function (url) {
            if (!url) return '';

            // убираем все известные прокси сколько угодно раз (лечит "двойной прокси")
            var changed = true;

            while (changed) {
                changed = false;

                for (var i = 0; i < PROXIES.length; i++) {
                    if (url.indexOf(PROXIES[i]) === 0) {
                        url = url.slice(PROXIES[i].length);
                        changed = true;
                    }
                }
            }

            return url;
        };

        this.proxify = function (url) {
            if (!url) return '';

            // всегда сначала чистим (это главное исправление против двойных префиксов)
            url = this.clearProxy(url);

            // если не http/https — не трогаем
            if (url.indexOf('http') !== 0) return url;

            // Добавляем прокси 1 раз
            return SETTINGS.current_proxy + url;
        };

        this.account = function (url) {
            if (!url) return url;

            // добавляем account_email/uid только в запросы API/страниц, а не к m3u8/mp4
            var clean = this.clearProxy(url);

            if (clean.indexOf('.mp4') > -1 || clean.indexOf('.m3u8') > -1) {
                return clean;
            }

            if (url.indexOf('account_email=') === -1) {
                url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(SETTINGS.email));
            }

            if (url.indexOf('uid=') === -1) {
                url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(SETTINGS.uid));
            }

            return url;
        };

        this.requestParams = function (base_url, extra_params) {
            var query = [];

            query.push('id=' + encodeURIComponent(object.movie.id));

            if (object.movie.imdb_id) query.push('imdb_id=' + encodeURIComponent(object.movie.imdb_id));
            if (object.movie.kinopoisk_id) query.push('kinopoisk_id=' + encodeURIComponent(object.movie.kinopoisk_id));

            query.push('title=' + encodeURIComponent(object.movie.title || object.movie.name || ''));
            query.push('original_title=' + encodeURIComponent(object.movie.original_title || object.movie.original_name || ''));
            query.push('serial=' + (object.movie.name ? 1 : 0));

            if (extra_params) {
                for (var key in extra_params) {
                    if (!extra_params.hasOwnProperty(key)) continue;
                    if (key === 'url' || key === 'method' || key === 'title') continue;
                    query.push(encodeURIComponent(key) + '=' + encodeURIComponent(extra_params[key]));
                }
            }

            return base_url + (base_url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
        };

        // ============ MAIN METHODS ============
        this.create = function () {
            var _this = this;

            filter.onSelect = function (type, a, b) {
                if (type === 'sort') {
                    active_source_name = a.source;
                    Lampa.Storage.set('skaz_last_balanser', active_source_name);

                    var base = SETTINGS.current_mirror + 'lite/' + active_source_name;
                    current_source = _this.requestParams(base);

                    filter_items.season = [];
                    filter_items.voice = [];

                    _this.updateFilter();
                    _this.find();
                }
                else if (type === 'filter') {
                    if (filter_items[a.stype] && filter_items[a.stype][b.index]) {
                        var item = filter_items[a.stype][b.index];

                        if (item.url) {
                            current_source = item.url;

                            if (item.extra_params) {
                                for (var key in item.extra_params) {
                                    if (!item.extra_params.hasOwnProperty(key)) continue;
                                    if (key === 'url' || key === 'method' || key === 'title') continue;

                                    if (current_source.indexOf(key + '=') === -1) {
                                        current_source = Lampa.Utils.addUrlComponent(
                                            current_source,
                                            key + '=' + encodeURIComponent(item.extra_params[key])
                                        );
                                    }
                                }
                            }

                            _this.find();
                        }

                        Lampa.Select.close();
                    }
                }
            };

            filter.onBack = function () {
                Lampa.Activity.backward();
            };

            filter.render().find('.filter--sort span').text('Источник');

            scroll.body().addClass('torrent-list');

            files.appendFiles(scroll.render());
            files.appendHead(filter.render());

            rotateProxy();
            SETTINGS.current_mirror = MIRRORS[Math.floor(Math.random() * MIRRORS.length)];

            this.start();
            return this.render();
        };

        this.render = function () {
            return files.render();
        };

        this.start = function () {
            var _this = this;

            Lampa.Controller.enable('content');
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));

            this.getIds().then(function () {
                _this.loadBalansers();
            });
        };

        this.getIds = function () {
            var _this = this;

            return new Promise(function (resolve) {
                if (object.movie.kinopoisk_id || object.movie.imdb_id) return resolve();

                var url = SETTINGS.current_mirror + 'externalids?id=' + encodeURIComponent(object.movie.id);
                url = _this.account(url);
                url = _this.proxify(url);

                network.timeout(15000);

                network.silent(url, function (json) {
                    try {
                        if (json && json.kinopoisk_id) object.movie.kinopoisk_id = json.kinopoisk_id;
                        if (json && json.imdb_id) object.movie.imdb_id = json.imdb_id;
                    } catch (e) { }
                    resolve();
                }, function () {
                    resolve();
                });
            });
        };

        this.loadBalansers = function () {
            var _this = this;

            var url = this.requestParams(SETTINGS.current_mirror + 'lite/events?life=true');
            url = this.account(url);
            url = this.proxify(url);

            network.timeout(15000);

            network.silent(url, function (json) {
                if (json && json.online && json.online.length) _this.buildSourceFilter(json.online);
                else _this.buildSourceFilter(DEFAULT_BALANSERS);
            }, function () {
                _this.buildSourceFilter(DEFAULT_BALANSERS);
            });
        };

        this.buildSourceFilter = function (online_list) {
            var _this = this;

            var source_items = [];
            sources = {};

            (online_list || []).forEach(function (item) {
                var name = (item.balanser || item.name || '').toLowerCase();
                if (!name) return;

                sources[name] = {
                    name: item.name || name,
                    url: item.url || (SETTINGS.current_mirror + 'lite/' + name)
                };

                source_items.push({
                    title: sources[name].name,
                    source: name,
                    selected: false
                });
            });

            if (!source_items.length) return this.showMessage('Нет доступных балансеров');

            var last = Lampa.Storage.get('skaz_last_balanser', '');
            var active = (source_items.filter(function (f) { return f.source === last; }).length) ? last : source_items[0].source;

            source_items.forEach(function (f) {
                f.selected = (f.source === active);
            });

            filter.set('sort', source_items);
            filter.chosen('sort', [sources[active].name]);

            active_source_name = active;

            if (sources[active].url.indexOf('?') > -1) current_source = sources[active].url;
            else current_source = _this.requestParams(sources[active].url);

            this.find();
        };

        this.find = function () {
            var _this = this;

            scroll.clear();
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));

            var url = this.account(current_source);
            url = this.proxify(url);

            log('Requesting content:', current_source);
            log('Via proxy:', url);

            network.native(url, function (str) {
                _this.parse(str);
            }, function () {
                rotateProxy();
                setTimeout(function () {
                    _this.tryNextMirror();
                }, 700);
            }, false, { dataType: 'text' });
        };

        this.tryNextMirror = function () {
            var current_idx = MIRRORS.indexOf(SETTINGS.current_mirror);
            var next_idx = (current_idx + 1) % MIRRORS.length;

            if (next_idx === 0) {
                this.showMessage('Ошибка сети. Все зеркала недоступны.\n\nПопробуйте позже.');
                return;
            }

            SETTINGS.current_mirror = MIRRORS[next_idx];
            log('Switching mirror to:', SETTINGS.current_mirror);

            var base = SETTINGS.current_mirror + 'lite/' + active_source_name;
            current_source = this.requestParams(base);

            this.find();
        };

        // ======= FIX: безопасный parse() для JSON-ответов =======
        this.parse = function (str) {
            var _this = this;

            var text = (str || '').trim();

            // Если сервер вернул JSON-конфиг/ответ — НЕ отдаём это в jQuery как селектор
            if (text && (text[0] === '{' || text[0] === '[')) {
                try {
                    var json = JSON.parse(text);

                    // Частый кейс: {"rch":true,"ws":"...","nws":"..."} — это не HTML
                    if (json && (json.rch || json.ws || json.nws || json.msg || json.accsdb)) {
                        log('JSON response (not HTML), skip HTML parse:', json);

                        // Если есть msg/ошибка — покажем пользователю
                        if (json.msg) _this.showMessage(json.msg);

                        rotateProxy();
                        _this.tryNextMirror();
                        return;
                    }
                } catch (e) {
                    // если JSON.parse упал — продолжим как HTML
                }
            }

            // Принудительно оборачиваем, чтобы jQuery воспринимал как HTML, а не selector
            var html = $('<div>' + (str || '') + '</div>');
            var content = html.find('.videos__item');

            this.parseFilters(html);

            scroll.clear();

            if (content.length) {
                content.each(function () {
                    var element = $(this);

                    element.on('hover:enter', function () {
                        var data = element.data('json');

                        if (data && data.url) {
                            if (data.method === 'play' || data.method === 'call') {
                                _this.play(data);
                            }
                            else if (data.method === 'link') {
                                current_source = data.url;
                                _this.find();
                            }
                        }
                    });

                    scroll.append(element);
                });
            }
            else {
                _this.showMessage('Пусто. Попробуйте другой источник или озвучку.');
            }

            Lampa.Controller.enable('content');
        };

        this.play = function (data) {
            var _this = this;

            log('Play method:', data.method);
            log('Play URL:', data.url);
            log('Play Stream:', data.stream);

            // 1) Прямая ссылка на поток
            if (data.method === 'play' && data.url && (data.url.indexOf('.mp4') > -1 || data.url.indexOf('.m3u8') > -1)) {
                var clean_url = _this.clearProxy(data.url);
                var final_url = clean_url; // для прямых ссылок оставляем чистую

                var video_data = {
                    title: data.title || 'Видео',
                    url: final_url,
                    quality: data.quality || {},
                    subtitles: data.subtitles || [],
                    timeline: data.timeline || {}
                };

                log('Direct play final URL:', final_url);

                Lampa.Player.play(video_data);
                Lampa.Player.playlist([video_data]);
                return;
            }

            // 2) API-метод (call): получаем JSON с url/quality
            if (data.method === 'call' || data.url || data.stream) {
                Lampa.Loading.start(function () {
                    Lampa.Loading.stop();
                });

                var api_url = data.url || data.stream || '';
                api_url = _this.clearProxy(api_url);
                api_url = _this.account(api_url);
                api_url = _this.proxify(api_url);

                log('Requesting video API (WITH PROXY):', api_url);

                network.timeout(20000);

                network.silent(api_url, function (response) {
                    Lampa.Loading.stop();

                    log('API Response type:', typeof response);
                    try { log('API Response:', JSON.stringify(response)); } catch (e) { }

                    if (response && response.accsdb) {
                        Lampa.Noty.show('Ошибка аккаунта. Требуется авторизация на сайте Skaz.');
                        return;
                    }

                    if (response && response.error) {
                        Lampa.Noty.show('Ошибка: ' + response.error);
                        return;
                    }

                    if (response && response.url) {
                        var final_url = _this.clearProxy(response.url);

                        var video_data = {
                            title: response.title || data.title || 'Видео',
                            url: final_url,
                            quality: response.quality || {},
                            subtitles: response.subtitles || [],
                            timeline: response.timeline || {}
                        };

                        log('Final video URL:', final_url);
                        log('Playing video:', video_data);

                        Lampa.Player.play(video_data);
                        Lampa.Player.playlist([video_data]);
                        return;
                    }

                    Lampa.Noty.show('Сервер не вернул ссылку на видео. Попробуйте другой источник.');
                }, function (err) {
                    Lampa.Loading.stop();

                    log('Network error when requesting video:', err);
                    rotateProxy();

                    Lampa.Noty.show('Ошибка сети при запросе видео. Попробуйте позже.');
                });

                return;
            }

            Lampa.Noty.show('Неизвестный формат видео');
        };

        this.parseFilters = function (html) {
            var filters_found = false;

            var seasons = html.find('.videos__season, .selector[data-type="season"]');
            if (seasons.length) {
                filter_items.season = [];
                seasons.each(function () {
                    var el = $(this);
                    var data = el.data('json');

                    if (data && data.url) {
                        filter_items.season.push({
                            title: el.text().trim(),
                            url: data.url,
                            extra_params: data,
                            selected: el.hasClass('focused') || el.hasClass('active')
                        });
                    }
                });
                filters_found = true;
            }

            var voices = html.find('.videos__button, .selector[data-type="voice"]');
            if (voices.length) {
                filter_items.voice = [];
                voices.each(function () {
                    var el = $(this);
                    var data = el.data('json');

                    if (data && data.url) {
                        filter_items.voice.push({
                            title: el.text().trim(),
                            url: data.url,
                            extra_params: data,
                            selected: el.hasClass('focused') || el.hasClass('active')
                        });
                    }
                });
                filters_found = true;
            }

            if (filters_found) this.updateFilter();
        };

        this.updateFilter = function () {
            var items = [];

            if (filter_items.season.length) {
                var selS = filter_items.season.filter(function (f) { return f.selected; })[0];
                items.push({
                    title: 'Сезон',
                    subtitle: (selS && selS.title) ? selS.title : 'Выбрать',
                    stype: 'season',
                    items: filter_items.season
                });
            }

            if (filter_items.voice.length) {
                var selV = filter_items.voice.filter(function (f) { return f.selected; })[0];
                items.push({
                    title: 'Перевод',
                    subtitle: (selV && selV.title) ? selV.title : 'Выбрать',
                    stype: 'voice',
                    items: filter_items.voice
                });
            }

            filter.set('filter', items);
        };

        this.showMessage = function (msg) {
            scroll.clear();

            var html = Lampa.Template.get('lampac_does_not_answer', {});
            html.find('.online-empty__title').html(msg);
            html.find('.online-empty__buttons').remove();

            scroll.append(html);
        };

        this.destroy = function () {
            network.clear();
            files.destroy();
            scroll.destroy();

            network = null;
            files = null;
            scroll = null;
            filter = null;
        };
    }

    function startPlugin() {
        if (window.plugin_skaz_lite_ready) return;
        window.plugin_skaz_lite_ready = true;

        Lampa.Component.add('skaz_lite', SkazLite);

        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                var btn = $(
                    '<div class="full-start__button selector view--online" data-subtitle="Skaz Lite">' +
                        '<span>Skaz Lite</span>' +
                    '</div>'
                );

                btn.on('hover:enter', function () {
                    Lampa.Activity.push({
                        url: '',
                        title: 'Skaz Lite',
                        component: 'skaz_lite',
                        movie: e.data.movie,
                        page: 1
                    });
                });

                // добавляем кнопку в карточку (если контейнер есть)
                try {
                    e.object.activity.render().find('.view--torrent').after(btn);
                } catch (err) { }
            }
        });
    }

    if (window.appready) startPlugin();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
