(function () {
    'use strict';

    function SkazLite(object) {
        var Network = Lampa.Request || Lampa.Reguest;
        var network = new Network();

        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files  = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);

        var last_focus = null;

        // ===== STATE =====
        var sources = {};
        var source_items = [];
        var active_source_name = '';

        var current_source = '';     
        var current_postid = null;   
        var current_season = 1;
        var current_voice_idx = 0;
        
        var connection_source = 'skaz'; 

        var filter_find = {
            season: [],
            voice: []
        };

        // Массив зеркал для перебора
        var MIRRORS = [
            'http://online3.skaz.tv/',
            'http://online7.skaz.tv/',
            'http://online4.skaz.tv/',
            'http://online5.skaz.tv/',
            'http://online6.skaz.tv/'
        ];

        var AB_TOKENS = ['мар.31', 'TotalᴬᵂUK0PRIMETEAM', 'сентябрь', 'июнь99'];
        var current_ab_token_index = 0;

        var SETTINGS = {
            email: 'aklama@mail.ru',
            uid: 'guest',
            current_mirror: MIRRORS[0]
        };

        var ALLOWED_BALANSERS = {
            videocdn: true,
            filmix: true,
            kinopub: true,
            alloha: true,
            rhsprem: true,
            kinobase: true,
            vkmovie: true,
            rezka: true
        };

        function log(msg, data) {
            try { console.log('[SkazLite]', msg, data || ''); } catch (e) {}
        }

        function rotateToken() {
            current_ab_token_index++;
            if (current_ab_token_index >= AB_TOKENS.length) current_ab_token_index = 0;
            log('Switched AB token to:', AB_TOKENS[current_ab_token_index]);
        }

        // Функция циклического перебора зеркал
        function rotateMirror() {
            var currentIndex = MIRRORS.indexOf(SETTINGS.current_mirror);
            var nextIndex = (currentIndex + 1) % MIRRORS.length;
            SETTINGS.current_mirror = MIRRORS[nextIndex];
            log('Switched mirror to:', SETTINGS.current_mirror);
        }
        
        function getHost() {
            return connection_source === 'ab2024' ? 'https://ab2024.ru/' : SETTINGS.current_mirror;
        }

        // ========= URL HELPERS (БЕЗ ПРОКСИ) =========
        this.clearProxy = function (url) {
            return (url || '').toString().trim();
        };

        this.normalizeUrl = function (url) {
            return this.clearProxy(url);
        };

        // Теперь просто возвращает URL как есть
        this.proxify = function (url) {
            return this.normalizeUrl(url);
        };

        this.account = function (url) {
            if (!url) return url;
            var clean = this.normalizeUrl(url);
            if (clean.indexOf('.mp4') > -1 || clean.indexOf('.m3u8') > -1) return clean;

            url = clean;
            if (connection_source === 'ab2024') {
                if (url.indexOf('uid=') === -1) {
                    url = Lampa.Utils.addUrlComponent(url, 'uid=4ezu837o');
                }
                var token = AB_TOKENS[current_ab_token_index];
                if (url.indexOf('ab_token=') === -1) {
                    url = Lampa.Utils.addUrlComponent(url, 'ab_token=' + encodeURIComponent(token));
                } else {
                    url = url.replace(/ab_token=([^&]+)/, 'ab_token=' + encodeURIComponent(token));
                }
            } else {
                if (url.indexOf('account_email=') === -1) {
                    url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(SETTINGS.email));
                }
                if (url.indexOf('uid=') === -1) {
                    url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(SETTINGS.uid));
                }
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
            } catch (e) { return null; }
        }

        // ========= HTML REQUEST С ПЕРЕБОРОМ ЗЕРКАЛ =========
        this.requestHtml = function (url, onOk, onFail) {
            var self = this;
            var attempts = 0;
            var maxAttempts = MIRRORS.length;

            function tryRequest() {
                var currentUrl = self.account(url);
                network.timeout(10000);
                
                log('Requesting URL:', currentUrl);

                network.native(currentUrl, function (str) {
                    onOk && onOk(str);
                }, function () {
                    attempts++;
                    if (connection_source === 'skaz' && attempts < maxAttempts) {
                        rotateMirror();
                        // Заменяем старый хост в URL на новый
                        url = url.replace(/^http:\/\/online[^/]+\.skaz\.tv\//, SETTINGS.current_mirror);
                        tryRequest();
                    } else if (connection_source === 'ab2024' && attempts < AB_TOKENS.length) {
                        rotateToken();
                        tryRequest();
                    } else {
                        onFail && onFail();
                    }
                }, false, { dataType: 'text' });
            }

            tryRequest();
        };

        // ========= UI: INIT & FILTER =========
        this.initialize = function() {
            var _this = this;
            filter.onBack = function() { _this.start(); };
            filter.onSelect = function(type, a, b) {
                if (type == 'filter') {
                    if (a.stype == 'connection') {
                        connection_source = b.index === 0 ? 'skaz' : 'ab2024';
                        current_ab_token_index = 0;
                        current_postid = null;
                        current_source = '';
                        current_season = null;
                        filter_find.season = [];
                        filter_find.voice = [];
                        _this.loadBalansers();
                        setTimeout(Lampa.Select.close, 10);
                    } else if (a.stype == 'source') {
                        var picked = source_items[b.index];
                        if (picked) {
                            active_source_name = picked.source;
                            Lampa.Storage.set('skaz_last_balanser', active_source_name);
                            current_postid = null;
                            current_source = '';
                            current_season = null;
                            var base = buildBaseSourceUrl();
                            var url = plugin.requestParams(base);
                            loadByUrl(url);
                        }
                    } else if (a.stype == 'season') {
                        var it = filter_find.season[b.index];
                        if (it) {
                            filter_find.season.forEach(function (s) { s.selected = false; });
                            it.selected = true;
                            current_season = it.season || (b.index + 1);
                            if (it.url) loadByUrl(it.url);
                            else loadSeason(current_season);
                        }
                    } else if (a.stype == 'voice') {
                        var it = filter_find.voice[b.index];
                        if (it) {
                            filter_find.voice.forEach(function (v) { v.selected = false; });
                            it.selected = true;
                            current_voice_idx = b.index;
                            if (it.url) loadByUrl(it.url);
                            else if (typeof it.t === 'number') loadVoice(it.t);
                        }
                    }
                    setTimeout(Lampa.Select.close, 10);
                }
            };

            scroll.body().addClass('torrent-list');
            files.appendFiles(scroll.render());
            files.appendHead(filter.render());
            scroll.minus(files.render().find('.explorer__files-head'));
            
            this.start();
        };

        this.updateFilterMenu = function() {
            var select = [];
            select.push({
                title: 'Источники',
                subtitle: connection_source === 'ab2024' ? 'https://ab2024.ru' : SETTINGS.current_mirror,
                items: [
                    { title: 'Skaz TV', selected: connection_source === 'skaz', index: 0 },
                    { title: 'AB2024', selected: connection_source === 'ab2024', index: 1 }
                ],
                stype: 'connection'
            });

            if (source_items.length > 0) {
                var srcIdx = 0;
                for(var i=0; i<source_items.length; i++) {
                    if (source_items[i].source === active_source_name) { srcIdx = i; break; }
                }
                select.push({
                    title: 'Балансер',
                    subtitle: source_items[srcIdx].title,
                    items: source_items.map(function(s, i) {
                        return { title: s.title, selected: i === srcIdx, index: i };
                    }),
                    stype: 'source'
                });
            }

            if (filter_find.season.length > 0) {
                var seasonIdx = 0;
                for(var i=0; i<filter_find.season.length; i++) {
                    if (filter_find.season[i].selected) { seasonIdx = i; break; }
                }
                select.push({
                    title: 'Сезон',
                    subtitle: filter_find.season[seasonIdx].title,
                    items: filter_find.season.map(function(s, i) {
                        return { title: s.title, selected: i === seasonIdx, index: i };
                    }),
                    stype: 'season'
                });
            }

            if (filter_find.voice.length > 0) {
                var voiceIdx = current_voice_idx || 0;
                select.push({
                    title: 'Озвучка',
                    subtitle: filter_find.voice[voiceIdx].title,
                    items: filter_find.voice.map(function(v, i) {
                        return { title: v.title, selected: i === voiceIdx, index: i };
                    }),
                    stype: 'voice'
                });
            }

            filter.set('filter', select);
            filter.render();
        };

        // ========= LOADERS =========
        var plugin = this;

        function buildBaseSourceUrl() {
            if (current_postid) {
                return getHost() + 'lite/' + active_source_name + '?postid=' + encodeURIComponent(current_postid);
            }
            return getHost() + 'lite/' + active_source_name;
        }

        function loadByUrl(url) {
            scroll.clear();
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));
            plugin.requestHtml(url, function (html) {
                plugin.parse(html);
            }, function () {
                plugin.empty('Ошибка сети после перебора серверов');
            });
        }

        function loadSeason(seasonNum) {
            current_season = seasonNum || 1;
            var base = buildBaseSourceUrl();
            var url = plugin.requestParams(base, { s: current_season });
            loadByUrl(url);
        }

        function loadVoice(voiceParam) {
            var base = buildBaseSourceUrl();
            var url = plugin.requestParams(base, { s: current_season, t: voiceParam });
            loadByUrl(url);
        }

        function goLink(url) {
            url = plugin.normalizeUrl(url);
            var pid = parseParam(url, 'postid');
            if (pid) current_postid = pid;
            loadByUrl(url);
        }

        // ========= PARSING =========
        this.parse = function (str) {
            var self = this;
            try {
                var j = JSON.parse(str);
                if (j && (j.accsdb || j.msg)) {
                    rotateMirror();
                    rotateToken();
                    return self.empty('Ошибка доступа/аккаунта');
                }
            } catch (e) {}

            var html = $(str);
            self.parseFilters(html);

            var content = html.find('.videos__item');
            var list_items = [];

            if (content && content.length) {
                content.each(function () {
                    var el = $(this);
                    var data = getJsonFromEl(el);
                    if (!data) return;

                    if (data.method === 'link' && data.url) {
                        list_items.push({
                            type: 'link',
                            title: guessTitle(el, data),
                            url: self.normalizeUrl(data.url)
                        });
                    } else if ((data.method === 'play' || data.method === 'call') && (data.url || data.stream)) {
                        list_items.push({
                            type: 'play',
                            title: guessTitle(el, data),
                            data: data
                        });
                    }
                });
            }

            scroll.clear();
            if (list_items.length) self.displayList(list_items);
            else self.empty('Ничего не найдено');
            Lampa.Controller.enable('content');
        };

        function getJsonFromEl(el) {
            var d = el.data('json');
            if (d) return d;
            var s = el.attr('data-json');
            if (s) { try { return JSON.parse(s); } catch (e) {} }
            return null;
        }

        function guessTitle(el, data) {
            var t = el.find('.videos__item-title,.videos__title,.videos__name').first().text().trim();
            if (!t) t = el.text().trim().split('\n')[0].trim();
            return t || 'Видео';
        }

        this.parseFilters = function (html) {
            var found_seasons = [];
            var seasons = html.find('.videos__season, .selector[data-type="season"]');
            if (seasons.length) {
                seasons.each(function () {
                    var el = $(this);
                    var data = getJsonFromEl(el) || {};
                    var txt = el.text().trim();
                    var m = txt.match(/(\d+)/);
                    found_seasons.push({
                        title: txt,
                        season: m ? parseInt(m[1], 10) : null,
                        url: data.url ? plugin.normalizeUrl(data.url) : null,
                        selected: el.hasClass('active')
                    });
                });
                filter_find.season = found_seasons;
            }

            var found_voices = [];
            var voices = html.find('.videos__button, .selector[data-type="voice"]');
            if (voices.length) {
                voices.each(function () {
                    var el = $(this);
                    var data = getJsonFromEl(el) || {};
                    var url = data.url ? plugin.normalizeUrl(data.url) : null;
                    var mm = url ? url.match(/[?&]t=(\d+)/) : null;
                    found_voices.push({
                        title: el.text().trim(),
                        url: url,
                        t: mm ? parseInt(mm[1], 10) : null,
                        selected: el.hasClass('active')
                    });
                });
                filter_find.voice = found_voices;
            }
            this.updateFilterMenu();
        };

        this.displayList = function(items) {
            var _this = this;
            items.forEach(function(element) {
                var html = $('<div class="online-prestige selector"><div class="online-prestige__body"><div class="online-prestige__title">' + element.title + '</div></div></div>');
                html.on('hover:enter', function() {
                    if (element.type === 'link') goLink(element.url);
                    else if (element.type === 'play') _this.play(element.data);
                });
                html.on('hover:focus', function(e) { last_focus = e.target; scroll.update(e.target, true); });
                scroll.append(html);
            });
        };

        // ========= PLAYER =========
        this.play = function (data) {
            var self = this;
            if (!data) return;
            if (!data.url && !data.stream) return;

            var play_url = self.account(data.url || data.stream);
            
            if (data.method === 'play' && (play_url.indexOf('.mp4') > -1 || play_url.indexOf('.m3u8') > -1)) {
                var video_data = { title: data.title || 'Видео', url: play_url };
                Lampa.Player.play(video_data);
                Lampa.Player.playlist([video_data]);
                return;
            }

            Lampa.Loading.start();
            network.silent(play_url, function (response) {
                Lampa.Loading.stop();
                if (response && response.url) {
                    var video_data = { title: response.title || data.title || 'Видео', url: self.normalizeUrl(response.url) };
                    Lampa.Player.play(video_data);
                    Lampa.Player.playlist([video_data]);
                } else {
                    Lampa.Noty.show('Ссылка не получена');
                }
            }, function () {
                Lampa.Loading.stop();
                rotateToken();
                Lampa.Noty.show('Ошибка при запросе потока');
            });
        };

        // ========= LIFE CYCLE =========
        this.create = function () { this.initialize(); return this.render(); };

        this.start = function() {
            var _this = this;
            if (Lampa.Activity.active().activity !== _this.activity) return;
            Lampa.Controller.add('content', {
                toggle: function() { Lampa.Controller.collectionSet(scroll.render(), files.render()); Lampa.Controller.collectionFocus(last_focus || false, scroll.render()); },
                left: function() { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
                right: function() { if (Navigator.canmove('right')) Navigator.move('right'); else filter.show('Фильтр', 'filter'); },
                up: function() { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); },
                down: function() { Navigator.move('down'); },
                back: function() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
            if (!active_source_name) {
                _this.getIds(function () { _this.loadBalansers(); });
            }
        };

        this.render = function () { return files.render(); };

        this.getIds = function (cb) {
            var self = this;
            if (object.movie.kinopoisk_id || object.movie.imdb_id) return cb();
            var url = self.account(getHost() + 'externalids?id=' + encodeURIComponent(object.movie.id || ''));
            network.silent(url, function (json) {
                if (json) {
                    if (json.kinopoisk_id) object.movie.kinopoisk_id = json.kinopoisk_id;
                    if (json.imdb_id) object.movie.imdb_id = json.imdb_id;
                }
                cb();
            }, function () { cb(); });
        };

        this.loadBalansers = function () {
            var self = this;
            var url = self.account(self.requestParams(getHost() + 'lite/events?life=true'));
            network.silent(url, function (json) {
                self.buildSourceFilter(json && json.online ? json.online : null);
            }, function () {
                self.buildSourceFilter(null);
            });
        };

        this.buildSourceFilter = function (online_list) {
            source_items = [];
            var list = online_list || [
                { name: 'VideoCDN', balanser: 'videocdn' },
                { name: 'Filmix', balanser: 'filmix' },
                { name: 'Rezka', balanser: 'rezka' }
            ];

            list.forEach(function (item) {
                var name = (item.balanser || item.name || '').toLowerCase();
                if (ALLOWED_BALANSERS[name]) {
                    source_items.push({ title: item.name || name, source: name, selected: false });
                }
            });

            if (!source_items.length) return plugin.empty('Нет балансеров');
            active_source_name = source_items[0].source;
            source_items[0].selected = true;

            var base = buildBaseSourceUrl();
            loadByUrl(plugin.requestParams(base));
        };

        this.empty = function (msg) {
            scroll.clear();
            var html = Lampa.Template.get('lampac_does_not_answer', {});
            html.find('.online-empty__title').html(msg || 'Пусто');
            html.find('.online-empty__buttons').remove();
            scroll.append(html);
        };

        this.destroy = function () {
            network = null; files = null; scroll = null;
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
                    Lampa.Activity.push({ url: '', title: 'Skaz Lite', component: 'skaz_lite', movie: e.data.movie, page: 1 });
                });
                e.object.activity.render().find('.view--torrent').after(btn);
            }
        });
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
})();