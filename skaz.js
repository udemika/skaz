(function () {
    'use strict';

    function SkazLite(object) {
        var Network = Lampa.Request || Lampa.Reguest;
        var network = new Network();

        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files  = new Lampa.Explorer(object);

        var last_focus = null;

        // ===== Состояния =====
        var sources = {};
        var source_items = [];
        var active_source_name = '';

        // всегда храним БЕЗ прокси
        var current_source = ''; // url списка
        var current_postid = null;

        var current_season = 1;
        var current_voice_idx = 0;

        var filter_find = {
            season: [],
            voice: []
        };

        var episodes_cache = []; // текущий список элементов (серии/файлы)

        // ===== Прокси/зеркала =====
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

        // ============ URL/PROXY HELPERS ============
        this.clearProxy = function (url) {
            if (!url) return '';

            var changed = true;
            url = (url + '').trim();

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
                    if (key !== 'url' && key !== 'method' && key !== 'title') {
                        query.push(key + '=' + encodeURIComponent(extra_params[key]));
                    }
                }
            }

            return base_url + (base_url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
        };

        // ============ SELECT HELPERS ============
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
                    onPick(idx);
                    setTimeout(safeSelectClose, 0);
                },
                onBack: function () {
                    setTimeout(safeSelectClose, 0);
                }
            });
        }

        // ============ MAIN UI (всё через Lampa.Select) ============
        function openMainMenu() {
            var items = [];

            items.push({ title: 'Источник: ' + (sources[active_source_name] ? sources[active_source_name].name : 'выбрать') });
            if (filter_find.season.length) items.push({ title: 'Сезон: ' + (getSelected(filter_find.season) || {}).title });
            if (filter_find.voice.length)  items.push({ title: 'Озвучка: ' + (getSelected(filter_find.voice) || {}).title });
            items.push({ title: 'Список (серии/файлы)' });

            Lampa.Select.show({
                title: 'SkazLite',
                items: items.map(function (x, i) { return { title: x.title, index: i, selected: false }; }),
                onSelect: function (a) {
                    if (!a) return;
                    if (a.index === 0) return openSourceSelect();
                    if (a.index === 1) return openSeasonSelect();
                    if (a.index === 2) return openVoiceSelect();
                    if (a.index === 3) return openEpisodesSelect();
                },
                onBack: function () {
                    setTimeout(safeSelectClose, 0);
                }
            });
        }

        function openSourceSelect() {
            showSelect('Источник', source_items, function (idx) {
                var picked = source_items[idx];
                if (!picked) return;

                active_source_name = picked.source;
                Lampa.Storage.set('skaz_last_balanser', active_source_name);

                // сброс
                current_postid = null;
                current_season = 1;
                current_voice_idx = 0;
                filter_find.season = [];
                filter_find.voice = [];
                episodes_cache = [];

                var base = SETTINGS.current_mirror + 'lite/' + active_source_name;
                current_source = _this.requestParams(base);

                _this.loadSeason(1);
            });
        }

        function openSeasonSelect() {
            if (!filter_find.season.length) return Lampa.Noty.show('Сезоны не найдены');

            showSelect('Сезон', filter_find.season, function (idx) {
                filter_find.season.forEach(function (s) { s.selected = false; });
                filter_find.season[idx].selected = true;

                current_season = filter_find.season[idx].season || (idx + 1);
                current_voice_idx = 0;

                _this.loadSeason(current_season);
            });
        }

        function openVoiceSelect() {
            if (!filter_find.voice.length) return Lampa.Noty.show('Озвучки не найдены');

            showSelect('Озвучка', filter_find.voice, function (idx) {
                filter_find.voice.forEach(function (v) { v.selected = false; });
                filter_find.voice[idx].selected = true;

                current_voice_idx = idx;

                // у голоса всегда есть t / url
                var vp = filter_find.voice[idx].t;
                _this.loadVoice(vp);
            });
        }

        function openEpisodesSelect() {
            if (!episodes_cache.length) return Lampa.Noty.show('Список пуст');

            showSelect('Список', episodes_cache, function (idx) {
                var it = episodes_cache[idx];
                if (it && it.data) _this.play(it.data);
            });
        }

        function getSelected(arr) {
            if (!arr || !arr.length) return null;
            for (var i = 0; i < arr.length; i++) if (arr[i].selected) return arr[i];
            return arr[0];
        }

        // ============ NETWORK (с fallback) ============
        this.requestText = function (url, onOk, onFail) {
            var self = this;

            url = self.normalizeUrl(url);
            if (!url) return onFail && onFail();

            // 1) сначала без прокси
            network.native(url, function (str) {
                onOk && onOk(str);
            }, function () {
                // 2) потом через прокси
                rotateProxy();
                network.native(self.proxify(url), function (str) {
                    onOk && onOk(str);
                }, function () {
                    onFail && onFail();
                }, false, { dataType: 'text' });
            }, false, { dataType: 'text' });
        };

        // ============ FLOW ============
        var _this = this;

        this.create = function () {
            // controller: всё завязано на системный select
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
                down: function () {
                    Navigator.move('down');
                },
                back: function () {
                    if (back_lock) return;
                    back_lock = true;

                    // критично: сначала закрыть Select, иначе возможна рекурсия
                    if (isSelectOpen()) safeSelectClose();
                    else Lampa.Activity.backward();

                    setTimeout(function () { back_lock = false; }, 0);
                }
            });

            scroll.body().addClass('torrent-list');
            files.appendFiles(scroll.render());
            scroll.minus(files.render().find('.explorer__files-head'));

            // старт
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

            var url = SETTINGS.current_mirror + 'externalids?id=' + encodeURIComponent(object.movie.id);
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
            var self = this;

            sources = {};
            source_items = [];

            (online_list || []).forEach(function (item) {
                var name = (item.balanser || item.name || '').toLowerCase();
                if (!name) return;
                if (!ALLOWED_BALANSERS[name]) return;

                var url = item.url || (SETTINGS.current_mirror + 'lite/' + name);
                url = self.normalizeUrl(url);

                sources[name] = { name: item.name || name, url: url };

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
                    url = self.normalizeUrl(url);

                    sources[name] = { name: item.name || name, url: url };

                    source_items.push({
                        title: sources[name].name,
                        source: name,
                        selected: false
                    });
                });
            }

            if (!source_items.length) return self.empty('Нет доступных балансеров');

            var last = Lampa.Storage.get('skaz_last_balanser', '');
            var active = source_items[0].source;

            for (var i = 0; i < source_items.length; i++) {
                if (source_items[i].source === last) { active = last; break; }
            }

            for (var j = 0; j < source_items.length; j++) {
                source_items[j].selected = (source_items[j].source === active);
            }

            active_source_name = active;

            // сброс фильтров
            current_postid = null;
            current_season = 1;
            current_voice_idx = 0;
            filter_find.season = [];
            filter_find.voice = [];
            episodes_cache = [];

            self.loadSeason(1);
        };

        this.loadSeason = function (seasonNum) {
            var self = this;

            current_season = seasonNum || 1;

            var base = SETTINGS.current_mirror + 'lite/' + active_source_name;
            var url = self.requestParams(base, { s: current_season });

            // если был выбран пост/ссылка — она может уже включать параметры
            if (current_source) url = current_source;

            url = self.account(url);

            self.requestText(url, function (html) {
                self.parse(html, false);
            }, function () {
                rotateMirror();
                self.empty('Ошибка сети');
            });
        };

        this.loadVoice = function (voiceParam) {
            var self = this;

            var base = SETTINGS.current_mirror + 'lite/' + active_source_name;
            var url = self.requestParams(base, { s: current_season, t: voiceParam });

            url = self.account(url);

            self.requestText(url, function (html) {
                self.parse(html, true);
            }, function () {
                rotateMirror();
                self.empty('Ошибка сети');
            });
        };

        function getJsonFromEl(el) {
            var d = el.data('json');
            if (d) return d;

            var s = el.attr('data-json');
            if (s) {
                try { return JSON.parse(s); } catch (e) {}
            }
            return null;
        }

        // keepVoices: если грузили voice — не пересобирать голоса (но сезоны можно)
        this.parse = function (str, keepVoices) {
            var self = this;

            // защитный JSON-check
            try {
                var j = JSON.parse(str);
                if (j && (j.accsdb || j.msg)) {
                    rotateProxy();
                    rotateMirror();
                    return self.empty('Ошибка ответа сервера');
                }
            } catch (e) {}

            var html = $(str);

            self.parseFilters(html, !!keepVoices);

            // ===== соберём список элементов (серии/файлы) -> показываем системным списком
            episodes_cache = [];

            var content = html.find('.videos__item');
            if (content && content.length) {
                content.each(function () {
                    var el = $(this);
                    var data = getJsonFromEl(el);

                    // fallback title
                    var title = el.find('.videos__item-title,.videos__title,.videos__name').first().text().trim();
                    if (!title) title = el.text().trim().split('\n')[0].trim();
                    if (!title) title = data && data.title ? data.title : 'Видео';

                    // пропускаем link-элементы в списке (они ломают UX), но можно оставить если нужно:
                    // if (data && data.method === 'link') return;

                    episodes_cache.push({
                        title: title,
                        data: data || null,
                        selected: false
                    });
                });
            }

            scroll.clear();

            if (episodes_cache.length) {
                // сразу показать системный список
                openEpisodesSelect();
            } else {
                self.empty('Пусто. Попробуйте другой источник/сезон/озвучку.');
            }

            Lampa.Controller.enable('content');
        };

        this.parseFilters = function (html, keepVoices) {
            // СЕЗОНЫ: пересобираем всегда
            filter_find.season = [];

            var seasons = html.find('.videos__season, .selector[data-type="season"], .videos__season-title');
            if (seasons && seasons.length) {
                seasons.each(function () {
                    var el = $(this);
                    var data = getJsonFromEl(el) || {};

                    var t = el.text().trim();
                    var m = t.match(/(\d+)/);
                    var sn = m ? parseInt(m[1], 10) : null;

                    filter_find.season.push({
                        title: t || (sn ? ('Сезон ' + sn) : 'Сезон'),
                        season: sn || null,
                        url: data.url ? _this.normalizeUrl(data.url) : null,
                        selected: el.hasClass('focused') || el.hasClass('active')
                    });
                });

                // fallback selected
                if (filter_find.season.length && !filter_find.season.some(function (s) { return s.selected; })) {
                    filter_find.season[0].selected = true;
                }

                var selS = getSelected(filter_find.season);
                if (selS && selS.season) current_season = selS.season;
            } else {
                // если сезонов нет (фильм) — оставим пусто
                filter_find.season = [];
            }

            // ОЗВУЧКИ: можно не трогать если keepVoices=true
            if (!keepVoices) {
                filter_find.voice = [];

                var voices = html.find('.videos__button, .selector[data-type="voice"]');
                if (voices && voices.length) {
                    voices.each(function () {
                        var el = $(this);
                        var data = getJsonFromEl(el) || {};

                        var title = el.text().trim();
                        var url = data.url ? _this.normalizeUrl(data.url) : null;

                        // вытащим t=... из url, если есть
                        var tParam = null;
                        if (url) {
                            var m = url.match(/[?&]t=(\d+)/);
                            if (m) tParam = parseInt(m[1], 10);
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

                    var selV = getSelected(filter_find.voice);
                    if (selV) current_voice_idx = filter_find.voice.indexOf(selV);
                }
            }
        };

        // ============ PLAYER ============
        this.play = function (data) {
            var self = this;

            if (!data || !data.url) {
                Lampa.Noty.show('Нет ссылки на видео');
                return;
            }

            log('Play method:', data.method);
            log('Play URL:', data.url);

            // прямой mp4/m3u8
            if (data.method === 'play' && (data.url.indexOf('.mp4') > -1 || data.url.indexOf('.m3u8') > -1)) {
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

            // call/api
            var api_url = data.url || data.stream;
            api_url = self.account(api_url);
            api_url = self.proxify(api_url);

            Lampa.Loading.start(function () { Lampa.Loading.stop(); });

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
