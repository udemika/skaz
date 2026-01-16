(function () {
    'use strict';

    function SkazLite(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        
        var sources = {};
        var current_source = '';
        var balanser_name = '';
        
        var MIRRORS = [
            'http://online3.skaz.tv/',
            'http://online4.skaz.tv/',
            'http://online5.skaz.tv/'
        ];
        
        var SETTINGS = {
            email: 'aklama@mail.ru',
            uid: 'guestn',
            current_mirror: MIRRORS[0]
        };

        this.account = function(url) {
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
            query.push('original_language=' + (object.movie.original_language || ''));
            var year = (object.movie.release_date || object.movie.first_air_date || '0000') + '';
            query.push('year=' + year.slice(0, 4));
            if (SETTINGS.email) query.push('cub_id=' + Lampa.Utils.hash(SETTINGS.email));
            return base_url + (base_url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
        };

        // --- ИСПРАВЛЕНИЕ: Методы инициализации ---

        this.create = function() {
            var _this = this;

            filter.onSelect = function(type, a, b) {
                if (type == 'sort') {
                    balanser_name = a.source;
                    Lampa.Storage.set('skaz_last_balanser', balanser_name);
                    if (sources[balanser_name]) {
                        current_source = sources[balanser_name].url;
                        _this.find();
                    }
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
            
            this.start();

            return this.render();
        };

        // ВАЖНО: Метод render обязателен для Lampa
        this.render = function() {
            return files.render();
        };

        this.start = function() {
            var _this = this;
            Lampa.Controller.enable('content');
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));

            this.getIds().then(function() {
                _this.loadSourceMap();
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
                    resolve();
                }, resolve);
            });
        };

        this.loadSourceMap = function() {
            var _this = this;
            var url = this.requestParams(SETTINGS.current_mirror + 'lite/events?life=true');
            url = this.account(url);

            network.timeout(15000);
            network.silent(url, function(json) {
                if (json.accsdb) {
                    _this.empty(json.msg || 'Ошибка доступа. Проверьте аккаунт.');
                } else if (json.online && json.online.length) {
                    _this.buildFilter(json.online);
                } else if (json.life) {
                     _this.buildFilter(json.online || []);
                } else {
                    _this.empty('Источники не найдены');
                }
            }, function() {
                var next_mirror_idx = (MIRRORS.indexOf(SETTINGS.current_mirror) + 1) % MIRRORS.length;
                SETTINGS.current_mirror = MIRRORS[next_mirror_idx];
                var url2 = _this.requestParams(SETTINGS.current_mirror + 'lite/events?life=true');
                network.silent(_this.account(url2), function(json){
                     if (json.online) _this.buildFilter(json.online);
                     else _this.empty('Источники не найдены (2)');
                }, function() {
                    _this.empty('Серверы Skaz.tv недоступны');
                });
            });
        };

        this.buildFilter = function(online_list) {
            var _this = this;
            var filter_items = [];
            sources = {};
            
            online_list.forEach(function(item) {
                var name = (item.balanser || item.name).toLowerCase();
                sources[name] = {
                    name: item.name,
                    url: item.url,
                    show: (typeof item.show == 'undefined' ? true : item.show)
                };
                
                if (sources[name].show) {
                    filter_items.push({
                        title: item.name,
                        source: name,
                        selected: false
                    });
                }
            });

            if (filter_items.length === 0) return this.empty('Нет доступных балансеров');

            var last = Lampa.Storage.get('skaz_last_balanser', '');
            var active = filter_items.find(f => f.source == last) ? last : filter_items[0].source;

            filter_items.forEach(f => f.selected = (f.source === active));
            
            filter.set('sort', filter_items);
            filter.chosen('sort', [sources[active].name]);
            
            balanser_name = active;
            current_source = sources[active].url;
            
            scroll.body().find('.lampac-content-loading').remove();
            
            this.find();
        };

        this.find = function() {
            var _this = this;
            scroll.clear();
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));

            var url = this.account(current_source);

            network.native(url, function(str) {
                _this.parse(str);
            }, function() {
                _this.empty('Ошибка загрузки видео');
            }, false, { dataType: 'text' });
        };

        this.parse = function(str) {
            var _this = this;
            scroll.clear();
            
            var is_json = false;
            try {
                var json = JSON.parse(str);
                is_json = true;
                if (json.accsdb || json.msg) {
                    return _this.empty(json.msg || 'Ошибка доступа');
                }
            } catch(e) {}

            var content = $(str).find('.videos__item');
            
            if (content.length) {
                content.each(function() {
                    var element = $(this);
                    element.on('hover:enter', function() {
                        var data = element.data('json');
                        if (data && data.url) {
                            if (data.method == 'play' || data.method == 'call') {
                                Lampa.Player.play(data);
                            } else if (data.method == 'link') {
                                current_source = data.url;
                                _this.find();
                            }
                        }
                    });
                    scroll.append(element);
                });
            } else {
                 if (is_json) _this.empty('Пустой JSON ответ');
                 else _this.empty('Контент не найден');
            }
            Lampa.Controller.enable('content');
        };

        this.empty = function(msg) {
            scroll.clear();
            var html = Lampa.Template.get('lampac_does_not_answer', {});
            html.find('.online-empty__title').text(msg);
            html.find('.online-empty__buttons').remove();
            scroll.append(html);
        };
        
        // ВАЖНО: Lampa может вызывать activity/destroy/stop/pause
        this.activity = object.activity;

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

        // Регистрируем компонент глобально перед использованием
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
