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

        // ВАЖНО: хранить без прокси, без account-параметров
        var current_source = '';     // текущая страница lite (html)
        var current_postid = null;   // postid выбранного совпадения (если был)
        var current_season = 1;
        var current_voice_idx = 0;
        
        // Переменная для выбора источника подключения
        // Порядок: 1. AB2024, 2. Showy, 3. Skaz
        var connection_source = 'ab2024'; // по умолчанию

        var filter_find = {
            season: [],
            voice: []
        };

        // ===== Mirrors SKAZ =====
        var MIRRORS = [
            'http://online3.skaz.tv/',
            'http://online7.skaz.tv/',
            'http://online4.skaz.tv/',
            'http://online5.skaz.tv/',
            'http://online6.skaz.tv/'
        ];

        // ===== Mirrors SHOWY (Новый источник) =====
        var MIRRORS_SHOWY = [
            'http://185.121.235.124:11176/',
            'http://showypro.com/',
            'http://smotretk.com/'
        ];

        // === ТОКЕНЫ AB2024 ===
        var AB_TOKENS = ['мар.31', 'TotalᴬᵂUK0PRIMETEAM', 'сентябрь', 'июнь99'];
        var current_ab_token_index = 0;

        var SETTINGS = {
            email: 'aklama@mail.ru',
            uid: 'guest',
            current_mirror: MIRRORS[0],
            current_showy_mirror: MIRRORS_SHOWY[0]
        };

        // ===== Только нужные балансеры (whitelist) =====
        var DEFAULT_BALANSERS = [
            { name: 'VideoCDN', balanser: 'videocdn' },
            { name: 'Filmix', balanser: 'filmix' },
            { name: 'FXApi', balanser: 'fxapi' }, // Добавлен
            { name: 'kinopub', balanser: 'kinopub' },
            { name: 'Alloha', balanser: 'alloha' },
            { name: 'RHS Premium', balanser: 'rhsprem' },
            { name: 'kinobase', balanser: 'kinobase' },
            { name: 'vkmovie', balanser: 'vkmovie' },
            { name: 'Rezka', balanser: 'rezka' }
        ];

        var ALLOWED_BALANSERS = {
            videocdn: true,
            filmix: true,
            fxapi: true, // Добавлен
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

        // Перебор зеркал по кругу (Skaz)
        function rotateMirror() {
            var currentIdx = MIRRORS.indexOf(SETTINGS.current_mirror);
            var nextIdx = (currentIdx + 1) % MIRRORS.length;
            SETTINGS.current_mirror = MIRRORS[nextIdx];
            log('Switched Skaz mirror to:', SETTINGS.current_mirror);
        }

        // Перебор зеркал по кругу (Showy)
        function rotateShowyMirror() {
            var currentIdx = MIRRORS_SHOWY.indexOf(SETTINGS.current_showy_mirror);
            var nextIdx = (currentIdx + 1) % MIRRORS_SHOWY.length;
            SETTINGS.current_showy_mirror = MIRRORS_SHOWY[nextIdx];
            log('Switched Showy mirror to:', SETTINGS.current_showy_mirror);
        }
        
        // Получение текущего базового хоста в зависимости от выбора
        function getHost() {
            if (connection_source === 'ab2024') return 'https://ab2024.ru/';
            if (connection_source === 'showy') return SETTINGS.current_showy_mirror;
            return SETTINGS.current_mirror;
        }

        // ========= URL HELPERS =========
        this.clearProxy = function (url) {
            if (!url) return '';
            return (url + '').trim();
        };

        this.normalizeUrl = function (url) {
            return this.clearProxy((url || '').toString().trim());
        };

        this.proxify = function (url) {
            return this.normalizeUrl(url);
        };

        this.account = function (url) {
            if (!url) return url;

            var clean = this.normalizeUrl(url);

            // к потокам не добавляем параметры
            if (clean.indexOf('.mp4') > -1 || clean.indexOf('.m3u8') > -1) return clean;

            url = clean;

            if (connection_source === 'ab2024') {
                // Логика авторизации для ab2024
                if (url.indexOf('uid=') === -1) {
                    url = Lampa.Utils.addUrlComponent(url, 'uid=4ezu837o');
                }
                
                var token = AB_TOKENS[current_ab_token_index];
                if (url.indexOf('ab_token=') === -1) {
                    url = Lampa.Utils.addUrlComponent(url, 'ab_token=' + encodeURIComponent(token));
                } else {
                    url = url.replace(/ab_token=([^&]+)/, 'ab_token=' + encodeURIComponent(token));
                }
            } 
            else if (connection_source === 'showy') {
                // Логика авторизации для Showy
                if (url.indexOf('uid=') === -1) {
                    url = Lampa.Utils.addUrlComponent(url, 'uid=i8nqb9vw');
                }
                if (url.indexOf('showy_token=') === -1) {
                    url = Lampa.Utils.addUrlComponent(url, 'showy_token=f8377057-90eb-4d76-93c9-7605952a096l');
                }
            }
            else {
                // Стандартная логика Skaz
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
            } catch (e) {
                return null;
            }
        }

        // ========= HTML REQUEST С ПЕРЕБОРОМ СЕРВЕРОВ (LOOP) =========
        this.requestHtml = function (url, onOk, onFail) {
            var self = this;
            
            var attempts = 0;
            var max_attempts = 1;

            if (connection_source === 'ab2024') max_attempts = AB_TOKENS.length;
            else if (connection_source === 'showy') max_attempts = MIRRORS_SHOWY.length;
            else max_attempts = MIRRORS.length;

            function tryRequest(current_url) {
                current_url = self.normalizeUrl(current_url);
                current_url = self.account(current_url);

                network.timeout(15000);
                
                log('Requesting:', current_url);

                network.native(current_url, function (str) {
                    onOk && onOk(str);
                }, function () {
                    attempts++;
                    if (attempts < max_attempts) {
                        if (connection_source === 'ab2024') {
                            rotateToken();
                            tryRequest(url);
                        } else if (connection_source === 'showy') {
                            rotateShowyMirror();
                            var new_url = current_url.replace(/http:\/\/(showypro\.com|showy\.pro|smotretk\.com)(\/)?/, SETTINGS.current_showy_mirror);
                            tryRequest(new_url);
                        } else {
                            rotateMirror();
                            var new_url = current_url.replace(/http:\/\/online.*?\.skaz\.tv\//, SETTINGS.current_mirror);
                            tryRequest(new_url);
                        }
                    } else {
                        onFail && onFail();
                    }
                }, false, { dataType: 'text' });
            }

            tryRequest(url);
        };

        // ========= UI: INIT & FILTER =========
        this.initialize = function() {
            var _this = this;

            filter.onBack = function() {
                _this.start();
            };

            filter.onSelect = function(type, a, b) {
                if (type == 'filter') {
                    if (a.stype == 'connection') {
                        // 1. ab2024, 2. showy, 3. skaz
                        if (b.index === 0) connection_source = 'ab2024';
                        else if (b.index === 1) connection_source = 'showy';
                        else connection_source = 'skaz';
                        
                        current_ab_token_index = 0;

                        current_postid = null;
                        current_source = '';
                        current_season = null;
                        current_voice_idx = 0;
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
                            current_voice_idx = 0;
                            filter_find.season = [];
                            filter_find.voice = [];
                            
                            var base = buildBaseSourceUrl();
                            var url = plugin.requestParams(base);
                            current_source = plugin.normalizeUrl(url);
                            loadByUrl(url);
                        }
                    } else if (a.stype == 'season') {
                        var it = filter_find.season[b.index];
                        if (it) {
                            filter_find.season.forEach(function (s) { s.selected = false; });
                            it.selected = true;

                            current_season = it.season || (b.index + 1);
                            current_voice_idx = 0;

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
            
            // 0. Выбор подключения (Источники)
            // 1. AB2024, 2. Showy, 3. Skaz
            var current_sub = '';
            if (connection_source === 'ab2024') current_sub = 'https://ab2024.ru';
            else if (connection_source === 'showy') current_sub = SETTINGS.current_showy_mirror;
            else current_sub = SETTINGS.current_mirror;

            select.push({
                title: 'Источники',
                subtitle: current_sub,
                items: [
                    { title: 'AB2024', selected: connection_source === 'ab2024', index: 0 },
                    { title: 'Showy', selected: connection_source === 'showy', index: 1 },
                    { title: 'Skaz TV', selected: connection_source === 'skaz', index: 2 }
                ],
                stype: 'connection'
            });

            // 1. Источник (Балансер)
            if (source_items.length > 0) {
                var srcIdx = 0;
                for(var i=0; i<source_items.length; i++) {
                    if (source_items[i].source === active_source_name) {
                        srcIdx = i;
                        break;
                    }
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

            // 2. Сезон
            if (filter_find.season.length > 0) {
                var seasonIdx = 0;
                for(var i=0; i<filter_find.season.length; i++) {
                    if (filter_find.season[i].selected) {
                        seasonIdx = i;
                        break;
                    }
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

            // 3. Озвучка
            if (filter_find.voice.length > 0) {
                var voiceIdx = current_voice_idx !== null ? current_voice_idx : 0;
                if (voiceIdx >= filter_find.voice.length) voiceIdx = 0;

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
                plugin.empty('Ошибка сети (все серверы недоступны)');
            });
        }

        function loadSeason(seasonNum) {
            current_season = seasonNum || 1;
            var base = buildBaseSourceUrl();
            var url = current_source ? current_source : plugin.requestParams(base, { s: current_season });
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
            url = plugin.normalizeUrl(url);
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

            try {
                var j = JSON.parse(str);
                if (j && (j.accsdb || j.msg)) {
                    if (connection_source === 'ab2024') rotateToken();
                    else if (connection_source === 'showy') rotateShowyMirror();
                    else rotateMirror();
                    
                    return self.empty('Ошибка ответа сервера');
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

                    // method: link
                    if (data.method === 'link' && data.url) {
                        list_items.push({
                            type: 'link',
                            title: guessTitle(el, data),
                            url: self.normalizeUrl(data.url),
                            original_data: data
                        });
                        return;
                    }

                    // method: play/call
                    if ((data.method === 'play' || data.method === 'call') && (data.url || data.stream)) {
                        if (data.url) data.url = self.normalizeUrl(data.url);
                        if (data.stream) data.stream = self.normalizeUrl(data.stream);

                        list_items.push({
                            type: 'play',
                            title: guessTitle(el, data),
                            data: data
                        });
                        return;
                    }
                });
            }

            // ЕСЛИ фильтр сезонов пуст, но в списке есть папки-сезоны (type: link)
            if (filter_find.season.length === 0 && list_items.length > 0) {
                 var links = list_items.filter(function(i){ return i.type === 'link'; });
                 if (links.length > 0) {
                     filter_find.season = links.map(function(item) {
                         var m = item.title.match(/(\d+)/);
                         var sn = m ? parseInt(m[1], 10) : null;
                         return {
                             title: item.title,
                             season: sn,
                             url: item.url,
                             selected: false
                         };
                     });
                     // Авто-выбор текущего сезона, если известен
                     if (current_season) {
                         filter_find.season.forEach(function(s){
                             if(s.season == current_season) s.selected = true;
                         });
                     }
                     self.updateFilterMenu(); 
                 }
            }

            scroll.clear();

            if (list_items.length) {
                self.displayList(list_items);
            } else {
                self.empty('Пусто. Попробуйте другой источник/сезон/озвучку.');
            }

            Lampa.Controller.enable('content');
        };

        this.parseFilters = function (html) {
            // == СЕЗОНЫ ==
            var found_seasons = [];
            var seasons = html.find('.videos__season, .selector[data-type="season"]');

            if (seasons && seasons.length) {
                seasons.each(function () {
                    var el = $(this);
                    var data = getJsonFromEl(el) || {};

                    var txt = el.text().trim();
                    var m = txt.match(/(\d+)/);
                    var sn = m ? parseInt(m[1], 10) : null;

                    found_seasons.push({
                        title: txt || (sn ? ('Сезон ' + sn) : 'Сезон'),
                        season: sn,
                        url: data.url ? plugin.normalizeUrl(data.url) : null,
                        selected: el.hasClass('focused') || el.hasClass('active')
                    });
                });
            }

            // Логика сохранения
            if (found_seasons.length > 0) {
                filter_find.season = found_seasons;
                // Если ни один не выбран, выбираем первый
                if (!filter_find.season.some(function (s) { return s.selected; })) {
                    filter_find.season[0].selected = true;
                }
                // Синхронизируем current_season
                var sSel = null;
                for (var i = 0; i < filter_find.season.length; i++) if (filter_find.season[i].selected) sSel = filter_find.season[i];
                if (sSel && sSel.season) current_season = sSel.season;
            } else {
                // Ничего не нашли в HTML
                if (filter_find.season.length > 0) {
                    filter_find.season.forEach(function(s) {
                        s.selected = (s.season == current_season);
                    });
                }
            }

            // == ОЗВУЧКИ ==
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
                
                var vSel = null;
                for (var i = 0; i < filter_find.voice.length; i++) if (filter_find.voice[i].selected) vSel = filter_find.voice[i];
                if (vSel) current_voice_idx = filter_find.voice.indexOf(vSel);
            }

            this.updateFilterMenu();
        };

        // ========= DISPLAY LIST =========
        this.displayList = function(items) {
            var _this = this;
            
            items.forEach(function(element) {
                var html = $('<div class="online-prestige selector">' +
                    '<div class="online-prestige__body">' +
                        '<div class="online-prestige__title">' + element.title + '</div>' +
                    '</div>' +
                '</div>');

                html.on('hover:enter', function() {
                    if (element.type === 'link') {
                        goLink(element.url);
                    } else if (element.type === 'play') {
                        _this.play(element.data);
                    }
                });

                html.on('hover:focus', function(e) {
                    last_focus = e.target;
                    scroll.update(e.target, true);
                });

                scroll.append(html);
            });
            
            Lampa.Controller.enable('content');
        };

        // ========= PLAYER =========
        this.play = function (data) {
            var self = this;

            if (!data) return;

            // link НЕ проигрывать — это переход
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

            Lampa.Loading.start(function () { Lampa.Loading.stop(); });
            network.timeout(15000);

            network.silent(api_url, function (response) {
                Lampa.Loading.stop();
                if (response && response.accsdb) {
                    Lampa.Noty.show('Ошибка аккаунта.');
                    return;
                }
                if (response && response.error) {
                    Lampa.Noty.show('Ошибка: ' + response.error);
                    return;
                }
                if (response && response.url) {
                    // ИСПРАВЛЕНИЕ: Обработка ' or ' в ссылках
                    var raw_url = response.url;
                    if (raw_url.indexOf(' or ') > -1) {
                        raw_url = raw_url.split(' or ')[0];
                    }
                    var final_url = self.normalizeUrl(raw_url);
                    
                    var quality = response.quality || {};
                    for (var key in quality) {
                         if (quality.hasOwnProperty(key)) {
                             var q_url = quality[key];
                             if (q_url && q_url.indexOf(' or ') > -1) {
                                 quality[key] = q_url.split(' or ')[0];
                             }
                         }
                    }

                    var video_data = {
                        title: response.title || data.title || 'Видео',
                        url: final_url,
                        quality: quality,
                        subtitles: response.subtitles || [],
                        timeline: response.timeline || {}
                    };
                    Lampa.Player.play(video_data);
                    Lampa.Player.playlist([video_data]);
                } else {
                    Lampa.Noty.show('Сервер не вернул ссылку.');
                }
            }, function () {
                Lampa.Loading.stop();
                if (connection_source === 'ab2024') rotateToken(); 
                Lampa.Noty.show('Ошибка сети при запросе видео');
            });
        };

        // ========= LIFE CYCLE =========
        this.create = function () {
            this.initialize();
            return this.render();
        };

        this.start = function() {
            var _this = this;
            if (Lampa.Activity.active().activity !== _this.activity) return;
            
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last_focus || false, scroll.render());
                },
                left: function() {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function() {
                    if (Navigator.canmove('right')) Navigator.move('right');
                    else filter.show('Фильтр', 'filter');
                },
                up: function() {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function() {
                    Navigator.move('down');
                },
                back: function() {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
            
            if (!active_source_name && !scroll.render().find('.lampac-loading').length) {
                scroll.clear();
                scroll.body().append(Lampa.Template.get('lampac_content_loading'));
                _this.getIds(function () {
                    _this.loadBalansers();
                });
            }
        };

        this.render = function () {
            return files.render();
        };

        this.getIds = function (cb) {
            var self = this;
            if (object.movie.kinopoisk_id || object.movie.imdb_id) {
                cb && cb();
                return;
            }
            var url = getHost() + 'externalids?id=' + encodeURIComponent(object.movie.id || '');
            url = self.account(url);
            network.timeout(15000);
            
            network.silent(url, function (json) {
                try {
                    if (json && json.kinopoisk_id) object.movie.kinopoisk_id = json.kinopoisk_id;
                    if (json && json.imdb_id) object.movie.imdb_id = json.imdb_id;
                } catch (e) {}
                cb && cb();
            }, function () {
                cb && cb();
            });
        };

        this.loadBalansers = function () {
            var self = this;
            var url = self.requestParams(getHost() + 'lite/events?life=true');
            url = self.account(url);
            network.timeout(15000);

            // Функция для загрузки балансеров с перебором
            var attempts = 0;
            var max_attempts = 1;

            if (connection_source === 'ab2024') max_attempts = AB_TOKENS.length;
            else if (connection_source === 'showy') max_attempts = MIRRORS_SHOWY.length;
            else max_attempts = MIRRORS.length;

            function tryLoad(current_url) {
                network.silent(current_url, function (json) {
                    if (json && json.online && json.online.length) self.buildSourceFilter(json.online);
                    else self.buildSourceFilter(DEFAULT_BALANSERS);
                }, function () {
                    attempts++;
                    if (attempts < max_attempts) {
                         if (connection_source === 'ab2024') {
                             rotateToken();
                             tryLoad(url); // Перезапуск с новым токеном (в account)
                         } else if (connection_source === 'showy') {
                             rotateShowyMirror();
                             var new_url = current_url.replace(/http:\/\/(showypro\.com|showy\.pro|smotretk\.com)(\/)?/, SETTINGS.current_showy_mirror);
                             tryLoad(new_url);
                         } else {
                             rotateMirror();
                             var new_url = current_url.replace(/http:\/\/online.*?\.skaz\.tv\//, SETTINGS.current_mirror);
                             tryLoad(new_url);
                         }
                    } else {
                         self.buildSourceFilter(DEFAULT_BALANSERS);
                    }
                });
            }
            
            tryLoad(url);
        };

        this.buildSourceFilter = function (online_list) {
            sources = {};
            source_items = [];

            (online_list || []).forEach(function (item) {
                var name = (item.balanser || item.name || '').toLowerCase();
                if (!name) return;
                if (!ALLOWED_BALANSERS[name]) return;
                var url = item.url || (getHost() + 'lite/' + name);
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
                    var url = getHost() + 'lite/' + name;
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
            active_source_name = active;
            
            for (var j = 0; j < source_items.length; j++) {
                source_items[j].selected = (source_items[j].source === active_source_name);
            }

            // сброс
            current_postid = null;
            current_source = '';
            current_season = null; // Сброс
            current_voice_idx = 0;
            filter_find.season = [];
            filter_find.voice = [];

            this.updateFilterMenu();
            
            var base = buildBaseSourceUrl();
            var url = plugin.requestParams(base); 
            current_source = plugin.normalizeUrl(url);
            loadByUrl(url);
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
            filter = null;
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