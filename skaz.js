(function () {
    'use strict';

    function SkazLite(object) {
        var Network = Lampa.Request || Lampa.Reguest;
        var network = new Network();

        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files  = new Lampa.Explorer(object);

        var last_focus = null;

        // ===== STATE =====
        var sources = {};
        var source_items = [];
        var active_source_name = '';

        // ВАЖНО: хранить без прокси, без account-параметров
        var current_source = '';     // текущая страница lite (html)
        var current_postid = null;   // postid выбранного совпадения (если был)
        var current_season = 1;
        var current_voice_idx = 0;

        var filter_find = {
            season: [],
            voice: []
        };

        // текущий список элементов, которые показываем в системном Select
        // (может быть список совпадений, список серий, список вариантов)
        var list_cache = [];

        // ===== Proxies/Mirrors =====
        var PROXIES = [
            'https://apn5.akter-black.com/',
            'https://apn10.akter-black.com/',
            'https://apn7.akter-black.com/',
            'https://apn6.akter-black.com/',
            'https://apn2.akter-black.com/'
        ];

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

        // ===== FIX: lampac_unic_id (persistent) =====
        var LAMPAC_UNIC_ID = (function () {
            try {
                var id = Lampa.Storage.get('lampac_unic_id');
                if (id) return id;
                id = Math.random().toString(36).slice(2, 10);
                Lampa.Storage.set('lampac_unic_id', id);
                return id;
            } catch (e) {
                return Math.random().toString(36).slice(2, 10);
            }
        })();


        // ===== Только нужные балансеры (whitelist) =====
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
            try { console.log('[SkazLite]', msg, data || ''); } catch (e) {}
        }

        function rotateProxy() {
            SETTINGS.current_proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
            log('Switched proxy to:', SETTINGS.current_proxy);
        }

        function rotateMirror() {
            SETTINGS.current_mirror = MIRRORS[Math.floor(Math.random() * MIRRORS.length)];
            log('Switched mirror to:', SETTINGS.current_mirror);
        }

        // ========= URL HELPERS =========
        this.clearProxy = function (url) {
            if (!url) return '';
            url = (url + '').trim();

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

            // прямые потоки не проксируем
            if (url.indexOf('.mp4') > -1 || url.indexOf('.m3u8') > -1) return url;

            return SETTINGS.current_proxy + url;
        };

        this.account = function (url) {
            if (!url) return url;

            var clean = this.normalizeUrl(url);

            // к потокам не добавляем параметры
            if (clean.indexOf('.mp4') > -1 || clean.indexOf('.m3u8') > -1) return clean;

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
            query.push('id=' + encodeURIComponent(object.movie.id || ''));
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

        function parseParam(url, name) {
            try {
                var m = (url || '').match(new RegExp('[?&]' + name + '=([^&]+)'));
                return m ? decodeURIComponent(m[1]) : null;
            } catch (e) {
                return null;
            }
        }

        // ========= Lampa.Select HELPERS =========
        function safeSelectClose() {
            try { Lampa.Select.close(); } catch (e) {}
        }

        function isSelectOpen() {
            try { return !!(Lampa.Select && Lampa.Select.is && Lampa.Select.is()); } catch (e) { return false; }
        }

        function showSelect(title, items, onPick) {
            if (!items || !items.length) {
                Lampa.Noty.show('Пусто');
                return;
            }

            var select_items = items.map(function (it, i) {
                return {
                    title: it.title || ('#' + (i + 1)),
                    index: i,
                    selected: !!it.selected
                };
            });

            Lampa.Select.show({
                title: title,
                items: select_items,
                onSelect: function (a) {
                    var idx = (a && typeof a.index === 'number') ? a.index : 0;
                    onPick && onPick(idx);
                    setTimeout(safeSelectClose, 0);
                },
                onBack: function () {
                    setTimeout(safeSelectClose, 0);
                }
            });
        }

        // ========= HTML REQUEST (ВСЕГДА text) =========
        this.requestHtml = function (url, onOk, onFail) {
            var self = this;

            // url может прийти с прокси — нормализуем
            url = self.normalizeUrl(url);
            url = self.account(url);

            // 1) сначала через прокси (иначе часто CORS)
            var proxied = self.proxify(url);

            network.timeout(15000);

            network.native(proxied, function (str) {
                onOk && onOk(str);
            }, function () {
                // 2) сменим прокси и попробуем ещё раз
                rotateProxy();
                proxied = self.proxify(url);

                network.native(proxied, function (str2) {
                    onOk && onOk(str2);
                }, function () {
                    // 3) сменим зеркало и попробуем
                    rotateMirror();

                    // если url был на старом зеркале — заменим префикс
                    var fixed = url;
                    for (var i = 0; i < MIRRORS.length; i++) {
                        // ничего
                    }

                    // грубо: если url начинается с http://onlineX.skaz.tv/ — заменим на текущий
                    fixed = fixed.replace(/^http:\/\/online[^/]+\.skaz\.tv\//, SETTINGS.current_mirror);

                    rotateProxy();
                    proxied = self.proxify(fixed);

                    network.native(proxied, function (str3) {
                        onOk && onOk(str3);
                    }, function () {
                        onFail && onFail();
                    }, false, { dataType: 'text' });
                }, false, { dataType: 'text' });
            }, false, { dataType: 'text' });
        };

        // ========= UI MENU (ВСЁ через Select) =========
        function getSelected(arr) {
            if (!arr || !arr.length) return null;
            for (var i = 0; i < arr.length; i++) if (arr[i].selected) return arr[i];
            return arr[0];
        }

        function openMainMenu() {
            var srcName = sources[active_source_name] ? sources[active_source_name].name : 'выбрать';
            var sSel = getSelected(filter_find.season);
            var vSel = getSelected(filter_find.voice);

            var items = [];
            items.push({ title: 'Источник: ' + srcName });
            if (filter_find.season.length) items.push({ title: 'Сезон: ' + ((sSel && sSel.title) ? sSel.title : '-') });
            if (filter_find.voice.length)  items.push({ title: 'Озвучка: ' + ((vSel && vSel.title) ? vSel.title : '-') });
            items.push({ title: 'Список (совпадения/серии)' });

            Lampa.Select.show({
                title: 'SkazLite',
                items: items.map(function (x, i) { return { title: x.title, index: i, selected: false }; }),
                onSelect: function (a) {
                    if (!a) return;
                    if (a.index === 0) return openSourceSelect();
                    if (a.index === 1) return openSeasonSelect();
                    if (a.index === 2) return openVoiceSelect();
                    if (a.index === 3) return openListSelect();
                },
                onBack: function () { setTimeout(safeSelectClose, 0); }
            });
        }

        function openSourceSelect() {
            showSelect('Источник', source_items, function (idx) {
                var picked = source_items[idx];
                if (!picked) return;

                active_source_name = picked.source;
                Lampa.Storage.set('skaz_last_balanser', active_source_name);

                // полный сброс
                current_postid = null;
                current_source = '';
                current_season = 1;
                current_voice_idx = 0;
                filter_find.season = [];
                filter_find.voice = [];
                list_cache = [];

                loadSeason(1);
            });
        }

        function openSeasonSelect() {
            if (!filter_find.season.length) return Lampa.Noty.show('Сезоны не найдены');

            showSelect('Сезон', filter_find.season, function (idx) {
                var it = filter_find.season[idx];
                if (!it) return;

                filter_find.season.forEach(function (s) { s.selected = false; });
                it.selected = true;

                current_season = it.season || (idx + 1);
                current_voice_idx = 0;

                // если сервер даёт прямой url на сезон — идём по нему
                if (it.url) loadByUrl(it.url);
                else loadSeason(current_season);
            });
        }

        function openVoiceSelect() {
            if (!filter_find.voice.length) return Lampa.Noty.show('Озвучки не найдены');

            showSelect('Озвучка', filter_find.voice, function (idx) {
                var it = filter_find.voice[idx];
                if (!it) return;

                filter_find.voice.forEach(function (v) { v.selected = false; });
                it.selected = true;

                current_voice_idx = idx;

                // ПРАВИЛЬНО: если есть url — грузим HTML по нему (не JSON)
                if (it.url) loadByUrl(it.url);
                else if (typeof it.t === 'number') loadVoice(it.t);
                else Lampa.Noty.show('Не найден параметр озвучки');
            });
        }

        function openListSelect() {
            if (!list_cache.length) return Lampa.Noty.show('Список пуст');

            showSelect('Список', list_cache, function (idx) {
                var it = list_cache[idx];
                if (!it) return;

                // link = перейти на другую HTML страницу
                if (it.type === 'link' && it.url) {
                    goLink(it.url);
                    return;
                }

                // play/call = проиграть
                if (it.type === 'play' && it.data) {
                    plugin.play(it.data);
                    return;
                }
            });
        }

        // ========= LOADERS =========
        var plugin = this;

        function buildBaseSourceUrl() {
            // если выбран postid — начинаем с него
            if (current_postid) {
                return SETTINGS.current_mirror + 'lite/' + active_source_name + '?postid=' + encodeURIComponent(current_postid);
            }
            return SETTINGS.current_mirror + 'lite/' + active_source_name;
        }

        function loadByUrl(url) {
            scroll.clear();
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));

            plugin.requestHtml(url, function (html) {
                plugin.parse(html);
            }, function () {
                plugin.empty('Ошибка сети');
            });
        }

function loadSeason(seasonNum) {
    current_season = seasonNum || 1;

    var base = buildBaseSourceUrl();

    // если уже есть current_source (например после link) — используем его как основу
    var url = current_source ? current_source : plugin.requestParams(base, { s: current_season });

    // 🔧 ВСТАВИТЬ ВОТ ЭТО (ТОЛЬКО ЭТО)
    if (!current_source && !current_postid) {
        url = url
            + '&rjson=False'
            + '&lampac_unic_id=' + LAMPAC_UNIC_ID;
    }

    // принудительно сохраним “текущую страницу”
    current_source = plugin.normalizeUrl(url);

    loadByUrl(url);
}

        function loadVoice(voiceParam) {
            var base = buildBaseSourceUrl();
            var url = plugin.requestParams(base, { s: current_season, t: voiceParam });

            current_source = plugin.normalizeUrl(url);

            loadByUrl(url);
        }

        function goLink(url) {
            // link ведёт на lite/.. HTML страницу, её надо загрузить как text
            url = plugin.normalizeUrl(url);

            // вытащим postid (если есть), чтобы дальше сезон/озвучка работали от него
            var pid = parseParam(url, 'postid');
            if (pid) current_postid = pid;

            current_source = url;

            loadByUrl(url);
        }

        // ========= PARSING =========
        function getJsonFromEl(el) {
            var d = el.data('json');
            if (d) return d;

            var s = el.attr('data-json');
            if (s) {
                try { return JSON.parse(s); } catch (e) {}
            }
            return null;
        }

        function guessTitle(el, data) {
            var t = el.find('.videos__item-title,.videos__title,.videos__name').first().text().trim();
            if (!t) t = el.text().trim().split('\n')[0].trim();
            if (!t && data && data.title) t = data.title;
            return t || 'Видео';
        }

        this.parse = function (str) {
            var self = this;

            // защита: если внезапно пришёл JSON с ошибкой
            try {
                var j = JSON.parse(str);
                if (j && (j.accsdb || j.msg)) {
                    rotateProxy();
                    rotateMirror();
                    return self.empty('Ошибка ответа сервера');
                }
            } catch (e) {}

            var html = $(str);

            self.parseFilters(html);

            // ВАЖНО: список в системном окне
            list_cache = [];

            var content = html.find('.videos__item');

            if (content && content.length) {
                content.each(function () {
                    var el = $(this);
                    var data = getJsonFromEl(el);

                    if (!data) return;

                    // method: link => это список совпадений/переход
                    if (data.method === 'link' && data.url) {
                        list_cache.push({
                            type: 'link',
                            title: guessTitle(el, data),
                            url: self.normalizeUrl(data.url),
                            selected: false
                        });
                        return;
                    }

                    // method: play/call => это уже элементы для проигрывания
                    if ((data.method === 'play' || data.method === 'call') && (data.url || data.stream)) {
                        // нормализуем url/stream
                        if (data.url) data.url = self.normalizeUrl(data.url);
                        if (data.stream) data.stream = self.normalizeUrl(data.stream);

                        list_cache.push({
                            type: 'play',
                            title: guessTitle(el, data),
                            data: data,
                            selected: false
                        });
                        return;
                    }
                });
            }

            scroll.clear();

            if (list_cache.length) {
                // сразу показать системный список
                openListSelect();
            } else {
                self.empty('Пусто. Попробуйте другой источник/сезон/озвучку.');
            }

            Lampa.Controller.enable('content');
        };

        this.parseFilters = function (html) {
            // сезоны
            filter_find.season = [];
            var seasons = html.find('.videos__season, .selector[data-type="season"]');

            if (seasons && seasons.length) {
                seasons.each(function () {
                    var el = $(this);
                    var data = getJsonFromEl(el) || {};

                    var txt = el.text().trim();
                    var m = txt.match(/(\d+)/);
                    var sn = m ? parseInt(m[1], 10) : null;

                    filter_find.season.push({
                        title: txt || (sn ? ('Сезон ' + sn) : 'Сезон'),
                        season: sn,
                        url: data.url ? plugin.normalizeUrl(data.url) : null,
                        selected: el.hasClass('focused') || el.hasClass('active')
                    });
                });

                if (filter_find.season.length && !filter_find.season.some(function (s) { return s.selected; })) {
                    filter_find.season[0].selected = true;
                }

                var sSel = getSelected(filter_find.season);
                if (sSel && sSel.season) current_season = sSel.season;
            }

            // озвучки
            filter_find.voice = [];
            var voices = html.find('.videos__button, .selector[data-type="voice"]');

            if (voices && voices.length) {
                voices.each(function () {
                    var el = $(this);
                    var data = getJsonFromEl(el) || {};

                    var title = el.text().trim();
                    var url = data.url ? plugin.normalizeUrl(data.url) : null;

                    var tParam = null;
                    if (url) {
                        var mm = url.match(/[?&]t=(\d+)/);
                        if (mm) tParam = parseInt(mm[1], 10);
                    }

                    filter_find.voice.push({
                        title: title || 'Озвучка',
                        url: url,
                        t: tParam,
                        selected: el.hasClass('focused') || el.hasClass('active')
                    });
                });

                if (filter_find.voice.length && !filter_find.voice.some(function (v) { return v.selected; })) {
                    filter_find.voice[0].selected = true;
                }

                var vSel = getSelected(filter_find.voice);
                if (vSel) current_voice_idx = filter_find.voice.indexOf(vSel);
            }
        };

        // ========= PLAYER =========
        this.play = function (data) {
            var self = this;

            if (!data) return;

            // НОВОЕ: link НЕ проигрывать — это переход (HTML)
            if (data.method === 'link' && data.url) {
                goLink(data.url);
                return;
            }

            if (!data.url && !data.stream) {
                Lampa.Noty.show('Нет ссылки на видео');
                return;
            }

            log('Play method:', data.method);
            log('Play URL:', data.url || data.stream);

            // прямой mp4/m3u8
            if (data.method === 'play' && data.url && (data.url.indexOf('.mp4') > -1 || data.url.indexOf('.m3u8') > -1)) {
                var clean = self.normalizeUrl(data.url);

                var video_data = {
                    title: data.title || 'Видео',
                    url: clean,
                    quality: data.quality || {},
                    subtitles: data.subtitles || [],
                    timeline: data.timeline || {}
                };

                Lampa.Player.play(video_data);
                Lampa.Player.playlist([video_data]);
                return;
            }

            // call/api (JSON)
            var api_url = data.url || data.stream;
            api_url = self.account(api_url);
            api_url = self.proxify(api_url);

            Lampa.Loading.start(function () { Lampa.Loading.stop(); });

            network.timeout(15000);

            network.silent(api_url, function (response) {
                Lampa.Loading.stop();

                if (response && response.accsdb) {
                    Lampa.Noty.show('Ошибка аккаунта. Требуется авторизация на сайте Skaz');
                    return;
                }

                if (response && response.error) {
                    Lampa.Noty.show('Ошибка: ' + response.error);
                    return;
                }

                if (response && response.url) {
                    var final_url = self.normalizeUrl(response.url);

                    var video_data = {
                        title: response.title || data.title || 'Видео',
                        url: final_url,
                        quality: response.quality || {},
                        subtitles: response.subtitles || [],
                        timeline: response.timeline || {}
                    };

                    Lampa.Player.play(video_data);
                    Lampa.Player.playlist([video_data]);
                } else {
                    Lampa.Noty.show('Сервер не вернул ссылку. Попробуйте другой источник.');
                }
            }, function () {
                Lampa.Loading.stop();
                rotateProxy();
                Lampa.Noty.show('Ошибка сети при запросе видео');
            });
        };

        // ========= LIFE CYCLE =========
        this.create = function () {
            var back_lock = false;

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last_focus, scroll.render());
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    openMainMenu();
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () { Navigator.move('down'); },
                back: function () {
                    if (back_lock) return;
                    back_lock = true;

                    // сначала закрываем Select
                    if (isSelectOpen()) safeSelectClose();
                    else Lampa.Activity.backward();

                    setTimeout(function () { back_lock = false; }, 0);
                }
            });

            scroll.body().addClass('torrent-list');
            files.appendFiles(scroll.render());
            scroll.minus(files.render().find('.explorer__files-head'));

            rotateProxy();
            rotateMirror();

            this.start();
            return this.render();
        };

        this.render = function () {
            return files.render();
        };

        this.start = function () {
            var self = this;

            Lampa.Controller.enable('content');
            scroll.clear();
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));

            self.getIds(function () {
                self.loadBalansers();
            });
        };

        this.getIds = function (cb) {
            var self = this;

            if (object.movie.kinopoisk_id || object.movie.imdb_id) {
                cb && cb();
                return;
            }

            var url = SETTINGS.current_mirror + 'externalids?id=' + encodeURIComponent(object.movie.id || '');
            url = self.account(url);

            network.timeout(15000);

            // сначала без прокси
            network.silent(url, function (json) {
                try {
                    if (json && json.kinopoisk_id) object.movie.kinopoisk_id = json.kinopoisk_id;
                    if (json && json.imdb_id) object.movie.imdb_id = json.imdb_id;
                } catch (e) {}
                cb && cb();
            }, function () {
                // fallback через прокси
                rotateProxy();
                network.silent(self.proxify(url), function (json) {
                    try {
                        if (json && json.kinopoisk_id) object.movie.kinopoisk_id = json.kinopoisk_id;
                        if (json && json.imdb_id) object.movie.imdb_id = json.imdb_id;
                    } catch (e) {}
                    cb && cb();
                }, function () {
                    cb && cb();
                });
            });
        };

        this.loadBalansers = function () {
            var self = this;

            var url = self.requestParams(SETTINGS.current_mirror + 'lite/events?life=true');
            url = self.account(url);

            network.timeout(15000);

            network.silent(url, function (json) {
                if (json && json.online && json.online.length) self.buildSourceFilter(json.online);
                else self.buildSourceFilter(DEFAULT_BALANSERS);
            }, function () {
                rotateProxy();
                network.silent(self.proxify(url), function (json) {
                    if (json && json.online && json.online.length) self.buildSourceFilter(json.online);
                    else self.buildSourceFilter(DEFAULT_BALANSERS);
                }, function () {
                    self.buildSourceFilter(DEFAULT_BALANSERS);
                });
            });
        };

        this.buildSourceFilter = function (online_list) {
            sources = {};
            source_items = [];

            (online_list || []).forEach(function (item) {
                var name = (item.balanser || item.name || '').toLowerCase();
                if (!name) return;
                if (!ALLOWED_BALANSERS[name]) return;

                var url = item.url || (SETTINGS.current_mirror + 'lite/' + name);
                sources[name] = { name: item.name || name, url: plugin.normalizeUrl(url) };

                source_items.push({
                    title: sources[name].name,
                    source: name,
                    selected: false
                });
            });

            if (!source_items.length) {
                (DEFAULT_BALANSERS || []).forEach(function (item) {
                    var name = (item.balanser || item.name || '').toLowerCase();
                    if (!name) return;
                    if (!ALLOWED_BALANSERS[name]) return;

                    var url = SETTINGS.current_mirror + 'lite/' + name;
                    sources[name] = { name: item.name || name, url: plugin.normalizeUrl(url) };

                    source_items.push({
                        title: sources[name].name,
                        source: name,
                        selected: false
                    });
                });
            }

            if (!source_items.length) return plugin.empty('Нет доступных балансеров');

            var last = Lampa.Storage.get('skaz_last_balanser', '');
            var active = source_items[0].source;

            for (var i = 0; i < source_items.length; i++) {
                if (source_items[i].source === last) { active = last; break; }
            }
            for (var j = 0; j < source_items.length; j++) {
                source_items[j].selected = (source_items[j].source === active);
            }

            active_source_name = active;

            // сброс
            current_postid = null;
            current_source = '';
            current_season = 1;
            current_voice_idx = 0;
            filter_find.season = [];
            filter_find.voice = [];
            list_cache = [];

            loadSeason(1);
        };

        this.empty = function (msg) {
            scroll.clear();
            var html = Lampa.Template.get('lampac_does_not_answer', {});
            html.find('.online-empty__title').html(msg || 'Пусто');
            html.find('.online-empty__buttons').remove();
            scroll.append(html);
        };

        this.destroy = function () {
            try { network.clear(); } catch (e) {}
            try { files.destroy(); } catch (e) {}
            try { scroll.destroy(); } catch (e) {}

            network = null;
            files = null;
            scroll = null;
            object = null;
        };
    }

    function startPlugin() {
        if (window.plugin_skaz_lite_ready) return;
        window.plugin_skaz_lite_ready = true;

        Lampa.Component.add('skaz_lite', SkazLite);

        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                var btn = $('<div class="full-start__button selector view--online" data-subtitle="Skaz Lite"><span>SkazLite</span></div>');

                btn.on('hover:enter', function () {
                    Lampa.Activity.push({
                        url: '',
                        title: 'Skaz Lite',
                        component: 'skaz_lite',
                        movie: e.data.movie,
                        page: 1
                    });
                });

                e.object.activity.render().find('.view--torrent').after(btn);
            }
        });
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();
