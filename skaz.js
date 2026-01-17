(function () {
    'use strict';

    function SkazLite(object) {
        var Network = Lampa.Request || Lampa.Reguest;
        var network = new Network();

        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);

        var last_focus = null;

        // ===== Состояния =====
        var sources = {};
        var active_source_name = '';

        // всегда храним БЕЗ прокси
        var current_source = '';

        var current_postid = null;

        var current_season = 1;
        var current_voice_idx = 0;
        var voice_params = [];

        var filter_translate = {
            season: 'Сезон',
            voice: 'Перевод'
        };

        var filter_find = {
            season: [],
            voice: []
        };

        // ===== Прокси/зеркала =====
        // cors557 убран
        var PROXIES = [
            'https://apn5.akter-black.com/',
            'https://apn10.akter-black.com/',
            'https://apn7.akter-black.com/',
            'https://apn6.akter-black.com/',
            'https://apn2.akter-black.com/'
        ];

        // onlinecf3 удалён
        var MIRRORS = [
            'http://online3.skaz.tv/',
            'http://online7.skaz.tv/'
        ];

        var SETTINGS = {
            email: 'aklama@mail.ru',
            uid: 'guest',
            current_mirror: MIRRORS[0],
            current_proxy: PROXIES[0]
        };

        // ===== Только нужные балансеры (и whitelist) =====
        var DEFAULT_BALANSERS = [
            { name: 'VideoCDN', balanser: 'videocdn' },
            { name: 'Filmix', balanser: 'filmix' },
            { name: 'kinopub', balanser: 'kinopub' },
            { name: 'Alloha', balanser: 'alloha' },
            { name: 'RHS Premium', balanser: 'rhsprem' },
            { name: 'Rezka', balanser: 'rezka' }
        ];

        var ALLOWED_BALANSERS = {
            videocdn: true,
            filmix: true,
            kinopub: true,
            alloha: true,
            rhsprem: true,
            rezka: true
        };

        function log(msg, data) {
            console.log('[SkazLite]', msg, data || '');
        }

        function rotateProxy() {
            SETTINGS.current_proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
            log('Switched proxy to:', SETTINGS.current_proxy);
        }

        // ============ URL/PROXY HELPERS ============
        this.clearProxy = function (url) {
            if (!url) return '';

            // удаляем префиксы прокси сколько угодно раз (лечит apn/apn/http...)
            var changed = true;

            while (changed) {
                changed = false;

                for (var i = 0; i < PROXIES.length; i++) {
                    var p = PROXIES[i];

                    if (url.indexOf(p) === 0) {
                        url = url.slice(p.length);
                        changed = true;
                    }
                }
            }

            return url;
        };

        this.normalizeUrl = function (url) {
            return this.clearProxy((url || '').toString().trim());
        };

        this.proxify = function (url) {
            url = this.normalizeUrl(url);
            if (!url) return '';
            if (url.indexOf('http') !== 0) return url;
            return SETTINGS.current_proxy + url;
        };

        this.account = function (url) {
            if (!url) return url;

            var clean = this.normalizeUrl(url);

            // к потокам не добавляем параметры
            if (clean.indexOf('.mp4') > -1 || clean.indexOf('.m3u8') > -1) {
                return clean;
            }

            url = clean;

            if (url.indexOf('account_email=') === -1) {
                url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(SETTINGS.email));
            }

            if (url.indexOf('uid=') === -1) {
                url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(SETTINGS.uid));
            }

            return url;
        };

        this.requestParams = function (base_url, extra_params) {
            base_url = this.normalizeUrl(base_url);

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

        function buildBaseSourceUrl() {
            // если выбрали похожий фильм/сериал — грузим по postid
            if (current_postid) {
                return SETTINGS.current_mirror + 'lite/' + active_source_name + '?rjson=False&postid=' + encodeURIComponent(current_postid);
            }
            return SETTINGS.current_mirror + 'lite/' + active_source_name;
        }

        // ============ UI HELPERS ============
        function makeEpisodeCard(item) {
            var seasonText = item.season ? ('Сезон ' + item.season) : '';
            var episodeText = item.episode ? (item.episode + ' серия') : 'Серия';

            var voiceText = item.voice ? item.voice : '';
            var topLine = [];

            if (active_source_name) topLine.push(active_source_name);
            if (voiceText) topLine.push(voiceText);
            if (seasonText) topLine.push(seasonText);
            if (item.episode) topLine.push('Серия ' + item.episode);

            var num = item.episode ? (item.episode < 10 ? '0' + item.episode : '' + item.episode) : '—';

            var html =
                '<div class="selector" style="' +
                    'background: rgba(255,255,255,0.06);' +
                    'border-radius: 0.6em;' +
                    'padding: 1.1em 1.2em;' +
                    'margin: 0.8em 0;' +
                    'display:flex;' +
                    'align-items:center;' +
                    'min-height: 6.5em;' +
                '">' +
                    '<div style="' +
                        'width: 6.2em;' +
                        'text-align:center;' +
                        'font-size: 2.6em;' +
                        'letter-spacing: 0.05em;' +
                        'opacity: 0.95;' +
                        'flex-shrink:0;' +
                    '">' + num + '</div>' +
                    '<div style="flex-grow:1; padding-left: 0.8em;">' +
                        '<div style="opacity:0.75; font-size:0.95em; margin-bottom:0.35em;">' + (topLine.join(' • ') || '') + '</div>' +
                        '<div style="font-size: 1.7em; line-height:1.15; margin-bottom:0.25em;">' + episodeText + '</div>' +
                        (voiceText ? '<div style="opacity:0.75; font-size: 1.05em;">' + voiceText + '</div>' : '') +
                    '</div>' +
                '</div>';

            var $el = $(html);

            $el.on('hover:enter', function () {
                // data.url может прийти уже с прокси — нормализуем
                var data = item.data || {};
                if (data.url) data.url = plugin.normalizeUrl(data.url);
                if (data.stream) data.stream = plugin.normalizeUrl(data.stream);

                plugin.play(data);
            });

            $el.on('hover:focus', function (e) {
                last_focus = e.target;
                scroll.update(e.target, true);
            });

            return $el;
        }

        function makeSimilarCard(movie) {
            var html =
                '<div class="online-prestige selector" style="padding: 1em; display:flex; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.06);">' +
                    '<div style="width: 5em; height: 7.5em; margin-right: 1.2em; flex-shrink:0; background: rgba(255,255,255,0.06); border-radius: 0.4em; overflow:hidden; position:relative;"></div>' +
                    '<div style="flex-grow:1;">' +
                        '<div style="font-size: 1.2em; font-weight:500; margin-bottom: 0.35em;">' + (movie.title || '') + '</div>' +
                        (movie.year ? '<div style="opacity:0.65; font-size: 0.95em;">' + movie.year + '</div>' : '') +
                    '</div>' +
                '</div>';

            var $el = $(html);

            var posterBox = $el.find('div').first();
            if (movie.img) {
                var img = $('<img style="width:100%; height:100%; object-fit:cover;">');
                img.attr('src', movie.img);
                img.on('error', function () {
                    $(this).remove();
                });
                posterBox.append(img);
            }

            $el.on('hover:enter', function () {
                if (!movie.postid) return;

                current_postid = movie.postid;
                current_season = 1;
                current_voice_idx = 0;
                filter_find.voice = [];
                voice_params = [];

                // грузим первый сезон/общую страницу по выбранному postid
                plugin.loadSeason(current_season);
            });

            $el.on('hover:focus', function (e) {
                last_focus = e.target;
                scroll.update(e.target, true);
            });

            return $el;
        }

        // ============ MAIN METHODS ============
        var plugin = this;

        this.create = function () {
            var _this = this;

            filter.onBack = function () {
                Lampa.Activity.backward();
            };

            filter.onSelect = function (type, a, b) {
                if (type === 'sort') {
                    active_source_name = a.source;
                    Lampa.Storage.set('skaz_last_balanser', active_source_name);

                    // сбрасываем контентные фильтры
                    current_postid = null;
                    current_season = 1;
                    current_voice_idx = 0;
                    voice_params = [];
                    filter_find.season = [];
                    filter_find.voice = [];

                    _this.updateFilterMenu();
                    _this.loadSeason(1);
                }
                else if (type === 'filter') {
                    if (a.stype === 'season') {
                        var sItem = filter_find.season[b.index];
                        if (sItem) {
                            current_season = sItem.season || 1;
                            current_voice_idx = 0;
                            filter_find.voice = [];
                            voice_params = [];

                            _this.updateFilterMenu();
                            _this.loadSeason(current_season);
                        }
                    }
                    else if (a.stype === 'voice') {
                        current_voice_idx = b.index;
                        _this.updateFilterMenu();
                        _this.loadVoice(voice_params[current_voice_idx]);
                    }

                    setTimeout(Lampa.Select.close, 10);
                }
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

            this.getIds(function () {
                _this.loadBalansers();
            });
        };

        this.getIds = function (cb) {
            var _this = this;

            // если уже есть imdb/kinopoisk — ок
            if (object.movie.kinopoisk_id || object.movie.imdb_id) {
                cb && cb();
                return;
            }

            var url = SETTINGS.current_mirror + 'externalids?id=' + encodeURIComponent(object.movie.id);
            url = _this.account(url);

            network.timeout(15000);

            // сначала без прокси
            network.silent(url, function (json) {
                try {
                    if (json && json.kinopoisk_id) object.movie.kinopoisk_id = json.kinopoisk_id;
                    if (json && json.imdb_id) object.movie.imdb_id = json.imdb_id;
                } catch (e) { }
                cb && cb();
            }, function () {
                // fallback через прокси
                rotateProxy();
                network.silent(_this.proxify(url), function (json) {
                    try {
                        if (json && json.kinopoisk_id) object.movie.kinopoisk_id = json.kinopoisk_id;
                        if (json && json.imdb_id) object.movie.imdb_id = json.imdb_id;
                    } catch (e) { }
                    cb && cb();
                }, function () {
                    cb && cb();
                });
            });
        };

        this.loadBalansers = function () {
            var _this = this;

            var url = this.requestParams(SETTINGS.current_mirror + 'lite/events?life=true');
            url = this.account(url);

            network.timeout(15000);

            // сначала без прокси
            network.silent(url, function (json) {
                if (json && json.online && json.online.length) {
                    _this.buildSourceFilter(json.online);
                } else {
                    _this.buildSourceFilter(DEFAULT_BALANSERS);
                }
            }, function () {
                // fallback через прокси
                rotateProxy();
                network.silent(_this.proxify(url), function (json) {
                    if (json && json.online && json.online.length) _this.buildSourceFilter(json.online);
                    else _this.buildSourceFilter(DEFAULT_BALANSERS);
                }, function () {
                    _this.buildSourceFilter(DEFAULT_BALANSERS);
                });
            });
        };

        this.buildSourceFilter = function (online_list) {
            var _this = this;

            var source_items = [];
            sources = {};

            (online_list || []).forEach(function (item) {
                var name = (item.balanser || item.name || '').toLowerCase();
                if (!name) return;
                if (!ALLOWED_BALANSERS[name]) return;

                var url = item.url || (SETTINGS.current_mirror + 'lite/' + name);
                url = _this.normalizeUrl(url);

                sources[name] = {
                    name: item.name || name,
                    url: url
                };

                source_items.push({
                    title: sources[name].name,
                    source: name,
                    selected: false
                });
            });

            // если сервер не дал ни одного из whitelist — берём дефолтные 6
            if (!source_items.length) {
                (DEFAULT_BALANSERS || []).forEach(function (item) {
                    var name = (item.balanser || item.name || '').toLowerCase();
                    if (!name) return;
                    if (!ALLOWED_BALANSERS[name]) return;

                    var url = SETTINGS.current_mirror + 'lite/' + name;
                    url = _this.normalizeUrl(url);

                    sources[name] = { name: item.name || name, url: url };

                    source_items.push({
                        title: sources[name].name,
                        source: name,
                        selected: false
                    });
                });
            }

            if (!source_items.length) return _this.empty('Нет доступных балансеров');

            var last = Lampa.Storage.get('skaz_last_balanser', '');
            var active = source_items[0].source;

            for (var i = 0; i < source_items.length; i++) {
                if (source_items[i].source === last) {
                    active = last;
                    break;
                }
            }

            for (var j = 0; j < source_items.length; j++) {
                source_items[j].selected = (source_items[j].source === active);
            }

            filter.set('sort', source_items);
            filter.chosen('sort', [sources[active].name]);

            active_source_name = active;

            // сброс фильтров на старте
            current_postid = null;
            current_season = 1;
            current_voice_idx = 0;
            voice_params = [];
            filter_find.season = [];
            filter_find.voice = [];

            _this.updateFilterMenu();
            _this.loadSeason(1);
        };

        // ====== Фильтр меню (как в swo.js) ======
        this.updateFilterMenu = function () {
            var select = [];

            if (filter_find.season && filter_find.season.length) {
                var seasonIdx = 0;

                for (var i = 0; i < filter_find.season.length; i++) {
                    if (filter_find.season[i].season === current_season) {
                        seasonIdx = i;
                        break;
                    }
                }

                select.push({
                    title: filter_translate.season,
                    subtitle: filter_find.season[seasonIdx] ? filter_find.season[seasonIdx].title : 'Выбрать',
                    items: (function () {
                        var arr = [];
                        for (var s = 0; s < filter_find.season.length; s++) {
                            arr.push({
                                title: filter_find.season[s].title,
                                selected: s === seasonIdx,
                                index: s
                            });
                        }
                        return arr;
                    })(),
                    stype: 'season'
                });
            }

            if (filter_find.voice && filter_find.voice.length) {
                var voiceIdx = (current_voice_idx !== null && current_voice_idx !== undefined) ? current_voice_idx : 0;
                if (voiceIdx >= filter_find.voice.length) voiceIdx = 0;

                select.push({
                    title: filter_translate.voice,
                    subtitle: filter_find.voice[voiceIdx] ? filter_find.voice[voiceIdx].title : 'Выбрать',
                    items: (function () {
                        var arr = [];
                        for (var v = 0; v < filter_find.voice.length; v++) {
                            arr.push({
                                title: filter_find.voice[v].title,
                                selected: v === voiceIdx,
                                index: v
                            });
                        }
                        return arr;
                    })(),
                    stype: 'voice'
                });
            }

            filter.set('filter', select);
        };

        // ====== Загрузка контента ======
        this.loadSeason = function (seasonNum) {
            var _this = this;

            seasonNum = seasonNum || 1;
            current_season = seasonNum;

            scroll.clear();
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));
            Lampa.Controller.enable('content');

            var base = buildBaseSourceUrl();
            var url = _this.requestParams(base, { s: seasonNum });

            // текущий запрос храним без прокси
            current_source = _this.normalizeUrl(url);

            _this.requestContent(current_source, false, function (html) {
                _this.parseInitial(html);
            });
        };

        this.loadVoice = function (voiceParam) {
            var _this = this;

            scroll.clear();
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));
            Lampa.Controller.enable('content');

            var base = buildBaseSourceUrl();
            var extra = {};

            if (current_season) extra.s = current_season;
            if (voiceParam !== undefined && voiceParam !== null) extra.t = voiceParam;

            var url = _this.requestParams(base, extra);

            current_source = _this.normalizeUrl(url);

            _this.requestContent(current_source, false, function (html) {
                _this.parseContent(html, true);
            });
        };

        this.requestContent = function (url, use_proxy, onOk) {
            var _this = this;

            url = _this.normalizeUrl(url);
            url = _this.account(url);
            url = _this.normalizeUrl(url);

            var requestUrl = use_proxy ? _this.proxify(url) : url;

            log('Requesting content:', url);
            log('Via proxy:', use_proxy ? requestUrl : '(no proxy)');

            network.native(
                requestUrl,
                function (str) {
                    onOk && onOk(str);
                },
                function () {
                    // если пробовали без прокси — один fallback с прокси
                    if (!use_proxy) {
                        rotateProxy();
                        setTimeout(function () {
                            _this.requestContent(url, true, onOk);
                        }, 400);
                        return;
                    }

                    // если уже через прокси — меняем зеркало
                    rotateProxy();
                    setTimeout(function () {
                        _this.tryNextMirror();
                    }, 700);
                },
                false,
                { dataType: 'text' }
            );
        };

        this.tryNextMirror = function () {
            var current_idx = MIRRORS.indexOf(SETTINGS.current_mirror);
            var next_idx = (current_idx + 1) % MIRRORS.length;

            if (next_idx === 0) {
                this.empty('Ошибка сети. Все зеркала недоступны.\n\nПопробуйте позже.');
                return;
            }

            SETTINGS.current_mirror = MIRRORS[next_idx];
            log('Switching mirror to:', SETTINGS.current_mirror);

            // перезагрузка текущего сезона
            this.loadSeason(current_season || 1);
        };

        // ====== Парсинг (как в swo.js: похожие -> список выбора) ======
        this.parseInitial = function (html) {
            var _this = this;

            try {
                var $dom = $('<div>' + (html || '') + '</div>');

                // проверка на "similar:true"
                var firstItem = $dom.find('.videos__item').first();
                if (firstItem && firstItem.length) {
                    var dj = firstItem.attr('data-json') || '';
                    if (dj) {
                        try {
                            var j = JSON.parse(dj);
                            if (j && j.similar === true) {
                                _this.parseSimilarMovies(html);
                                return;
                            }
                        } catch (e) { }
                    }
                }

                // сезоны (если есть)
                _this.parseSeasonsFromDom($dom);

                // если сезонов нет — сразу контент
                _this.parseContent(html, false);
            }
            catch (e) {
                _this.empty('Ошибка разбора данных');
            }
        };

        this.parseSeasonsFromDom = function ($dom) {
            // ищем сезоны
            var seasons = [];
            var seasonNodes = $dom.find('.videos__season-title, .videos__season');

            seasonNodes.each(function () {
                var $el = $(this);
                var title = ($el.text() || '').trim();

                var seasonNum = null;

                // пробуем вытащить номер сезона из текста
                var m = title.match(/(\d+)/);
                if (m && m[1]) seasonNum = parseInt(m[1], 10);

                // если не получилось — берём индексом
                if (!seasonNum) seasonNum = seasons.length + 1;

                seasons.push({
                    title: title || ('Сезон ' + seasonNum),
                    season: seasonNum
                });
            });

            // если сервер не дал список сезонов — для сериалов хотя бы сезон 1
            if (!seasons.length && object.movie && object.movie.name) {
                seasons.push({ title: 'Сезон 1', season: 1 });
            }

            filter_find.season = seasons;

            if (filter_find.season && filter_find.season.length) {
                var found = false;
                for (var i = 0; i < filter_find.season.length; i++) {
                    if (filter_find.season[i].season === current_season) {
                        found = true;
                        break;
                    }
                }
                if (!found) current_season = filter_find.season[0].season || 1;
            }

            this.updateFilterMenu();
        };

        this.parseSimilarMovies = function (html) {
            var _this = this;

            try {
                var $dom = $('<div>' + (html || '') + '</div>');
                var items = $dom.find('.videos__item');

                var movies = [];

                items.each(function () {
                    try {
                        var $item = $(this);
                        var dj = $item.attr('data-json');
                        if (!dj) return;

                        var j = JSON.parse(dj);
                        if (!j || j.similar !== true) return;

                        var title = ($item.find('.videos__season-title').text() || $item.find('.videos__item-title').text() || '').trim();

                        var postid = null;
                        if (j.url) {
                            var m = (j.url + '').match(/postid=([^&]+)/);
                            if (m && m[1]) postid = m[1];
                        }

                        var kp = j.kinopoisk_id || j.kp_id || j.kinopoiskid || j.kpid;
                        var img = '';

                        if (kp) {
                            img = 'https://st.kp.yandex.net/images/film_iphone/iphone360_' + kp + '.jpg';
                        } else if (j.img || j.image) {
                            img = (j.img || j.image);
                            // если вдруг прислали "proxyimg...", попробуем вытащить http...
                            if (img.indexOf('http') === -1 && img.indexOf('proxyimg') > -1) {
                                var parts = img.split('http');
                                if (parts.length > 1) img = 'http' + parts[1];
                            }
                        }

                        movies.push({
                            title: title || (j.title || ''),
                            year: j.year || '',
                            postid: postid,
                            img: img
                        });
                    } catch (e) { }
                });

                if (!movies.length) {
                    _this.empty('Не удалось найти варианты по названию');
                    return;
                }

                _this.showSimilarMoviesList(movies);
            } catch (e) {
                _this.empty('Ошибка разбора списка вариантов');
            }
        };

        this.showSimilarMoviesList = function (movies) {
            scroll.clear();

            var title = $('<div style="opacity:0.75; padding: 0.8em 0.2em 0.4em 0.2em;">Выберите вариант (год выпуска)</div>');
            scroll.append(title);

            for (var i = 0; i < movies.length; i++) {
                scroll.append(makeSimilarCard(movies[i]));
            }

            Lampa.Controller.enable('content');
        };

        // ====== Парсинг контента (серии/озвучки) ======
        this.parseContent = function (html, keepVoices) {
            var _this = this;

            try {
                var $dom = $('<div>' + (html || '') + '</div>');

                // голоса/переводы
                if (!keepVoices) {
                    filter_find.voice = [];
                    voice_params = [];

                    var voiceButtons = $dom.find('.videos__button');
                    voiceButtons.each(function () {
                        try {
                            var $btn = $(this);
                            var title = ($btn.text() || '').trim();
                            var dj = $btn.attr('data-json');
                            if (!title || !dj) return;

                            var j = JSON.parse(dj);
                            if (!j || !j.url) return;

                            // вытаскиваем t= из url
                            var m = (j.url + '').match(/[?&]t=(\d+)/);
                            if (!m || !m[1]) return;

                            filter_find.voice.push({ title: title });
                            voice_params.push(parseInt(m[1], 10));
                        } catch (e) { }
                    });

                    if (filter_find.voice.length) {
                        if (current_voice_idx === null || current_voice_idx === undefined) current_voice_idx = 0;
                        if (current_voice_idx >= filter_find.voice.length) current_voice_idx = 0;
                    }

                    _this.updateFilterMenu();
                }

                // эпизоды
                var episodes = [];
                var epNodes = $dom.find('.videos__item');

                epNodes.each(function () {
                    try {
                        var $it = $(this);
                        var dj = $it.attr('data-json');
                        if (!dj) return;

                        var data = JSON.parse(dj);
                        if (!data || !data.url) return;

                        data.url = _this.normalizeUrl(data.url);
                        if (data.stream) data.stream = _this.normalizeUrl(data.stream);

                        var t = ($it.find('.videos__item-title').text() || '').trim();

                        // атрибуты s/e встречаются у подобных источников (как в swo.js)
                        var sAttr = parseInt($it.attr('s') || current_season || 0, 10) || current_season || 0;
                        var eAttr = parseInt($it.attr('e') || 0, 10) || 0;

                        episodes.push({
                            title: t || ('Серия ' + eAttr),
                            season: sAttr,
                            episode: eAttr,
                            voice: (filter_find.voice && filter_find.voice[current_voice_idx]) ? filter_find.voice[current_voice_idx].title : '',
                            data: data
                        });
                    } catch (e) { }
                });

                scroll.clear();

                if (!episodes.length) {
                    _this.empty('Пусто. Попробуйте другой источник/перевод.');
                    return;
                }

                // сортируем по номеру серии, если есть
                episodes.sort(function (a, b) {
                    return (a.episode || 0) - (b.episode || 0);
                });

                // рисуем как на скриншоте — большими карточками
                for (var i = 0; i < episodes.length; i++) {
                    scroll.append(makeEpisodeCard(episodes[i]));
                }

                Lampa.Controller.enable('content');
            }
            catch (e) {
                _this.empty('Ошибка разбора серий');
            }
        };

        // ====== Воспроизведение (video API: сначала без прокси) ======
        this.play = function (data) {
            var _this = this;

            data = data || {};
            if (data.url) data.url = _this.normalizeUrl(data.url);
            if (data.stream) data.stream = _this.normalizeUrl(data.stream);

            log('Play method:', data.method);
            log('Play URL:', data.url);
            log('Play Stream:', data.stream);

            // 1) прямая ссылка
            if (data.method === 'play' && data.url && (data.url.indexOf('.mp4') > -1 || data.url.indexOf('.m3u8') > -1)) {
                var clean_url = _this.normalizeUrl(data.url);

                var video_data = {
                    title: data.title || 'Видео',
                    url: clean_url,
                    quality: data.quality || {},
                    subtitles: data.subtitles || [],
                    timeline: data.timeline || {}
                };

                Lampa.Player.play(video_data);
                Lampa.Player.playlist([video_data]);
                return;
            }

            // 2) call: API ссылка ДОЛЖНА идти без прокси спереди, потом fallback
            if (data.method === 'call' || data.url || data.stream) {
                Lampa.Loading.start(function () { Lampa.Loading.stop(); });

                var api_url = _this.normalizeUrl(data.url || data.stream || '');
                api_url = _this.account(api_url);
                api_url = _this.normalizeUrl(api_url);

                log('Requesting video API (NO PROXY):', api_url);

                network.timeout(20000);

                network.silent(api_url, function (response) {
                    _this._handleVideoApiResponse(response, data);
                }, function () {
                    rotateProxy();
                    var px = _this.proxify(api_url);
                    log('Video API fallback (WITH PROXY):', px);

                    network.silent(px, function (response) {
                        _this._handleVideoApiResponse(response, data);
                    }, function () {
                        Lampa.Loading.stop();
                        Lampa.Noty.show('Ошибка сети при запросе видео. Попробуйте позже.');
                    });
                });

                return;
            }

            Lampa.Noty.show('Неизвестный формат видео');
        };

        this._handleVideoApiResponse = function (response, original_data) {
            Lampa.Loading.stop();

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
                var final_url = this.normalizeUrl(response.url);

                var video_data = {
                    title: response.title || (original_data && original_data.title) || 'Видео',
                    url: final_url,
                    quality: response.quality || {},
                    subtitles: response.subtitles || [],
                    timeline: response.timeline || {}
                };

                Lampa.Player.play(video_data);
                Lampa.Player.playlist([video_data]);
                return;
            }

            Lampa.Noty.show('Сервер не вернул ссылку на видео. Попробуйте другой источник.');
        };

        this.empty = function (msg) {
            var html = Lampa.Template.get('lampac_does_not_answer', {});
            html.find('.online-empty__title').text(msg || 'Пусто');
            html.find('.online-empty__buttons').remove();

            scroll.clear();
            scroll.append(html);

            Lampa.Controller.enable('content');
        };

        this.destroy = function () {
            network.clear();
            files.destroy();
            scroll.destroy();

            network = null;
            files = null;
            scroll = null;
            filter = null;

            object = null;
            sources = null;
            filter_find = null;
            voice_params = null;
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
