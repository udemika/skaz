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
        
        var MIRRORS = [
            'http://online3.skaz.tv/',
            'http://online7.skaz.tv/',
            'http://onlinecf3.skaz.tv/,'
            'http://online5.skaz.tv/'
        ];

        var unic_id = Lampa.Storage.get('lampac_unic_id', '');
        if (!unic_id) {
            unic_id = Lampa.Utils.uid(8).toLowerCase();
            Lampa.Storage.set('lampac_unic_id', unic_id);
        }
        
        var SETTINGS = {
            email: 'aklama@mail.ru',
            uid: 'guest',
            current_mirror: MIRRORS[0]
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

        this.account = function(url) {
            if (!url) return url;
            if (url.indexOf('account_email=') == -1) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(SETTINGS.email));
            if (url.indexOf('uid=') == -1) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(SETTINGS.uid));
            if (url.indexOf('lampac_unic_id=') == -1) url = Lampa.Utils.addUrlComponent(url, 'lampac_unic_id=' + encodeURIComponent(unic_id));
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
            query.push('cub_id=' + Lampa.Utils.hash(SETTINGS.email));
            return base_url + (base_url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
        };

        this.create = function() {
            var _this = this;

            filter.onSelect = function(type, a, b) {
                if (type == 'sort') {
                    active_source_name = a.source;
                    Lampa.Storage.set('skaz_last_balanser', active_source_name);
                    
                    log('Selected source:', active_source_name);

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
                             log('Selected filter item:', item.title);
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
            
            SETTINGS.current_mirror = MIRRORS[Math.floor(Math.random() * MIRRORS.length)];
            log('Start on mirror:', SETTINGS.current_mirror);
            
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
                network.silent(url, function(json) {
                    if (json.kinopoisk_id) object.movie.kinopoisk_id = json.kinopoisk_id;
                    if (json.imdb_id) object.movie.imdb_id = json.imdb_id;
                    log('IDs loaded:', json);
                    resolve();
                }, function() {
                    log('IDs load error');
                    resolve();
                });
            });
        };

        this.loadBalansers = function() {
            var _this = this;
            var url = this.requestParams(SETTINGS.current_mirror + 'lite/events?life=true');
            url = this.account(url);
            
            log('Loading balansers list:', url);

            network.timeout(10000);
            network.silent(url, function(json) {
                if (json.online && json.online.length) {
                    log('Balansers found:', json.online.length);
                    _this.buildSourceFilter(json.online);
                } else {
                    log('Balansers list empty or invalid, using default');
                    _this.buildSourceFilter(DEFAULT_BALANSERS);
                }
            }, function() {
                log('Balansers load error, using default');
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
            
            log('Initial source selected:', current_source);
            this.find();
        };

        this.find = function() {
            var _this = this;
            scroll.clear(); 
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));

            var url = this.account(current_source);
            log('Requesting content:', url);

            network.native(url, function(str) {
                _this.parse(str);
            }, function() {
                log('Network error requesting content');
                _this.tryNextMirror();
            }, false, { dataType: 'text' });
        };
        
        this.tryNextMirror = function() {
            var current_idx = MIRRORS.indexOf(SETTINGS.current_mirror);
            var next_idx = (current_idx + 1) % MIRRORS.length;
            
            if (next_idx === 0) { 
                this.showMessage('Ошибка сети. Все зеркала недоступны.');
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
                    log('Access blocked by server:', json.msg);
                    return _this.tryNextMirror();
                }
            } catch(e) {}

            var html = $(str);
            var content = html.find('.videos__item');
            
            log('Content parsed, items count:', content.length);

            this.parseFilters(html);
            
            scroll.clear();

            if (content.length) {
                content.each(function() {
                    var element = $(this);
                    
                    element.on('hover:enter', function() {
                        var data = element.data('json');
                        
                        if (data && data.url) {
                            if (data.method == 'play' || data.method == 'call') {
                                
                                // --- ИСПРАВЛЕНИЕ: Добавляем подпись к URL видео ---
                                data.url = _this.account(data.url);
                                
                                log('Playing media (signed):', data.url);
                                
                                Lampa.Player.play(data);
                                
                                var playlist = [];
                                content.each(function(){
                                    var item = $(this).data('json');
                                    if(item.method == 'play' || item.method == 'call'){
                                        // И к каждому элементу плейлиста тоже
                                        item.url = _this.account(item.url); 
                                        playlist.push(item);
                                    }
                                });
                                Lampa.Player.playlist(playlist);
                                
                            } else if (data.method == 'link') {
                                log('Following link:', data.url);
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
                log('Filters found (seasons/voices)');
                this.updateFilter();
            }
        };

        this.updateFilter = function() {
            var items = [];
            
            if (filter_items.season.length) {
                items.push({
                    title: 'Сезон',
                    subtitle: (filter_items.season.find(f=>f.selected) || {}).title || 'Выбрать',
                    stype: 'season',
                    items: filter_items.season
                });
            }
            
            if (filter_items.voice.length) {
                items.push({
                    title: 'Перевод',
                    subtitle: (filter_items.voice.find(f=>f.selected) || {}).title || 'Выбрать',
                    stype: 'voice',
                    items: filter_items.voice
                });
            }
            
            filter.set('filter', items);
        };

        this.showMessage = function(msg) {
            scroll.clear();
            var html = Lampa.Template.get('lampac_does_not_answer', {});
            html.find('.online-empty__title').html(msg);
            html.find('.online-empty__buttons').remove();
            scroll.append(html);
        };
        
        this.destroy = function() {
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
            if (e.type == 'complite') {
                var btn = $('<div class="full-start__button selector view--online" data-subtitle="Skaz Lite"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.14 2.86l-3.37 1.83C12.35 4.93 12 5.37 12 5.86v13.06c0 1.05 1.15 1.69 2.05 1.15l8.67-5.2c.86-.52.86-1.78 0-2.3l-5.63-3.38V5.86c0-.42-.23-.81-.6-1.02l-4.35-1.98z" fill="white"/><path opacity="0.4" d="M12.77 4.69l-3.37-1.83a1.18 1.18 0 0 0-1.09 0l-5.63 3.38c-.86.52-.86 1.78 0 2.3l8.67 5.2c.9.54 2.05-.1 2.05-1.15V5.86c0-.49-.35-.93-.63-1.17z" fill="white"/></svg><span>SkazLite</span></div>');

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
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') startPlugin();
        });
    }

})();
