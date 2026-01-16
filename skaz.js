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
        
        // --- СПИСОК ПРОКСИ ---
        var PROXIES = [
            'https://cors.byskaz.ru/',
            'http://85.198.110.239:8975/',
            'http://91.184.245.56:8975/',
            'https://apn10.akter-black.com/',
            'https://apn5.akter-black.com/',
            'https://cors557.deno.dev/'
        ];

        var MIRRORS = [
            'http://online3.skaz.tv/',
            'http://online7.skaz.tv/',
            'http://onlinecf3.skaz.tv/',
            'http://online5.skaz.tv/'
        ];

        var SETTINGS = {
            email: 'aklama@mail.ru',
            uid: 'guest',
            current_mirror: MIRRORS[0],
            current_proxy: PROXIES[0] // Текущий прокси
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

        // Выбор случайного прокси
        function rotateProxy() {
            SETTINGS.current_proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
            log('Switched proxy to:', SETTINGS.current_proxy);
        }

        // Обертка для URL через прокси
        this.proxify = function(url) {
            // Не проксируем, если это уже проксированная ссылка или прямой файл
            if (url.indexOf('.mp4') > -1 || url.indexOf('.m3u8') > -1) return url;
            if (url.indexOf('http') !== 0) return url; // Относительные ссылки не трогаем
            
            return SETTINGS.current_proxy + url;
        };

        this.account = function(url) {
            if (!url) return url;
            
            if (url.indexOf('.mp4') > -1 || url.indexOf('.m3u8') > -1) {
                return url;
            }

            if (url.indexOf('account_email=') == -1) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(SETTINGS.email));
            if (url.indexOf('uid=') == -1) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(SETTINGS.uid));
            
            return url;
        };

        this.requestParams = function(base_url) {
            var query = [];
            query.push('id=' + object.movie.id);
            if (object.movie.imdb_id) query.push('imdb_id=' + object.movie.imdb_id);
            if (object.movie.kinopoisk_id) query.push('kinopoisk_id=' + object.movie.kinopoisk_id);
            query.push('title=' + encodeURIComponent(object.movie.title || object.movie.name));
            query.push('original_title=' + encodeURIComponent(object.movie.original_title || object.movie.original_name));
            query.push('serial=' + (object.movie.name ? 1 : 0));
            
            return base_url + (base_url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
        };

        this.create = function() {
            var _this = this;

            filter.onSelect = function(type, a, b) {
                if (type == 'sort') {
                    active_source_name = a.source;
                    Lampa.Storage.set('skaz_last_balanser', active_source_name);
                    
                    var base = SETTINGS.current_mirror + 'lite/' + active_source_name;
                    current_source = _this.requestParams(base);
                    
                    filter_items.season = [];
                    filter_items.voice = [];
                    _this.updateFilter(); 
                    
                    _this.find();
                } else if (type == 'filter') {
                    if (filter_items[a.stype] && filter_items[a.stype][b.index]) {
                         var item = filter_items[a.stype][b.index];
                         if (item.url) {
                             current_source = item.url;
                             _this.find();
                         }
                    }
                    Lampa.Select.close();
                }
            };
            
            filter.onBack = function() {
                Lampa.Activity.backward();
            };

            filter.render().find('.filter--sort span').text('Источник');
            scroll.body().addClass('torrent-list');
            files.appendFiles(scroll.render());
            files.appendHead(filter.render());
            
            rotateProxy(); // Выбираем прокси при старте
            SETTINGS.current_mirror = MIRRORS[Math.floor(Math.random() * MIRRORS.length)];
            
            this.start();

            return this.render();
        };

        this.render = function() {
            return files.render();
        };

        this.start = function() {
            var _this = this;
            Lampa.Controller.enable('content');
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));

            this.getIds().then(function() {
                _this.loadBalansers();
            });
        };

        this.getIds = function() {
            var _this = this;
            return new Promise(function(resolve) {
                if (object.movie.kinopoisk_id || object.movie.imdb_id) return resolve();
                
                var url = _this.account(SETTINGS.current_mirror + 'externalids?id=' + object.movie.id);
                // Пробуем получить ID через прокси
                network.silent(_this.proxify(url), function(json) {
                    if (json.kinopoisk_id) object.movie.kinopoisk_id = json.kinopoisk_id;
                    if (json.imdb_id) object.movie.imdb_id = json.imdb_id;
                    resolve();
                }, resolve); // Если ошибка, просто идем дальше
            });
        };

        this.loadBalansers = function() {
            var _this = this;
            var url = this.requestParams(SETTINGS.current_mirror + 'lite/events?life=true');
            url = this.account(url);
            
            // Используем прокси для загрузки списка балансеров
            network.timeout(15000); // Чуть больше таймаут для прокси
            network.silent(_this.proxify(url), function(json) {
                if (json.online && json.online.length) {
                    _this.buildSourceFilter(json.online);
                } else {
                    _this.buildSourceFilter(DEFAULT_BALANSERS);
                }
            }, function() {
                _this.buildSourceFilter(DEFAULT_BALANSERS);
            });
        };

        this.buildSourceFilter = function(online_list) {
            var _this = this;
            var source_items = [];
            sources = {};
            
            online_list.forEach(function(item) {
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

            if (source_items.length === 0) return this.showMessage('Нет доступных балансеров');

            var last = Lampa.Storage.get('skaz_last_balanser', '');
            var active = source_items.find(f => f.source == last) ? last : source_items[0].source;

            source_items.forEach(f => f.selected = (f.source === active));
            
            filter.set('sort', source_items);
            filter.chosen('sort', [sources[active].name]);
            
            active_source_name = active;
            
            if (sources[active].url.indexOf('?') > -1) {
                current_source = sources[active].url;
            } else {
                current_source = _this.requestParams(sources[active].url);
            }
            
            this.find();
        };

        this.find = function() {
            var _this = this;
            scroll.clear(); 
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));

            var url = this.account(current_source);
            var proxied_url = this.proxify(url);
            
            log('Requesting content via proxy:', proxied_url);

            network.native(proxied_url, function(str) {
                _this.parse(str);
            }, function() {
                // Если ошибка сети - меняем прокси и зеркало
                rotateProxy();
                setTimeout(function(){
                    _this.tryNextMirror();
                }, 1000);
            }, false, { dataType: 'text' });
        };
        
        this.tryNextMirror = function() {
            var current_idx = MIRRORS.indexOf(SETTINGS.current_mirror);
            var next_idx = (current_idx + 1) % MIRRORS.length;
            
            if (next_idx === 0) { 
                this.showMessage('Ошибка сети. Все зеркала недоступны.<br>Попробуйте позже.');
                return;
            }
            
            SETTINGS.current_mirror = MIRRORS[next_idx];
            log('Switching mirror to:', SETTINGS.current_mirror);
            
            var base = SETTINGS.current_mirror + 'lite/' + active_source_name;
            current_source = this.requestParams(base);
            
            this.find();
        };

        this.parse = function(str) {
            var _this = this;
            
            try {
                var json = JSON.parse(str);
                if (json.accsdb || json.msg) {
                    // Если забанили - меняем прокси
                    rotateProxy();
                    return _this.tryNextMirror();
                }
            } catch(e) {}

            var html = $(str);
            var content = html.find('.videos__item');
            
            this.parseFilters(html);
            
            scroll.clear();

            if (content.length) {
                content.each(function() {
                    var element = $(this);
                    
                    element.on('hover:enter', function() {
                        var data = element.data('json');
                        
                        if (data && data.url) {
                            if (data.method == 'play' || data.method == 'call') {
                                _this.play(data); 
                            } else if (data.method == 'link') {
                                current_source = data.url;
                                _this.find();
                            }
                        }
                    });
                    scroll.append(element);
                });
            } else {
                 _this.showMessage('Пусто. Попробуйте другой источник или озвучку.');
            }
            Lampa.Controller.enable('content');
        };
        
        this.play = function(data) {
            var _this = this;
            var url = _this.account(data.url);
            
            if (url.indexOf('.mp4') > -1 || url.indexOf('.m3u8') > -1) {
                log('Playing direct video file:', url);
                data.url = url; 
                Lampa.Player.play(data);
                Lampa.Player.playlist([data]); 
                return;
            }

            Lampa.Loading.start(function() {
                Lampa.Loading.stop();
            });

            // Для резолвинга ссылки тоже используем прокси, если нужно
            var resolve_url = _this.proxify(url);
            log('Resolving API link via proxy:', resolve_url);

            network.silent(resolve_url, function(json) {
                Lampa.Loading.stop();
                
                if (json && json.url) {
                    var clean_video_url = _this.account(json.url); 
                    log('Video resolved from API:', clean_video_url);
                    
                    var video_data = {
                        title: data.title || json.title,
                        url: clean_video_url,
                        quality: json.quality || {},
                        subtitles: json.subtitles || [],
                        timeline: json.timeline || {}
                    };
                    
                    Lampa.Player.play(video_data);
                    Lampa.Player.playlist([video_data]);
                    
                } else {
                    Lampa.Noty.show('Не удалось получить ссылку на видео');
                }
            }, function() {
                Lampa.Loading.stop();
                Lampa.Noty.show('Ошибка запроса видео');
            });
        };

        this.parseFilters = function(html) {
            var _this = this;
            var filters_found = false;
            
            var seasons = html.find('.videos__season, .selector[data-type="season"]');
            if (seasons.length) {
                filter_items.season = [];
                seasons.each(function() {
                    var el = $(this);
                    var data = el.data('json'); 
                    if (data && data.url) {
                        filter_items.season.push({
                            title: el.text().trim(),
                            url: data.url,
                            selected: el.hasClass('focused') || el.hasClass('active')
                        });
                    }
                });
                filters_found = true;
            }
            
            var voices = html.find('.videos__button, .selector[data-type="voice"]');
            if (voices.length) {
                filter_items.voice = [];
                voices.each(function() {
                    var el = $(this);
                    var data = el.data('json'); 
                    if (data && data.url) {
                        filter_items.voice.push({
                            title: el.text().trim(),
                            url: data.url,
                            selected: el.hasClass('focused') || el.hasClass('active')
                        });
                    }
                });
                filters_found = true;
            }
            
            if (filters_found) {
                this.updateFilter();
            }
        };

        this.updateFilter = function() {
            var items = [];
            
            if (filter_items.season.length) {
                items.push({
                    title: 'Сезон',
                    subtitle: (filter_items.season.find(f=>f.selected) || {}).title || 'Выбра
