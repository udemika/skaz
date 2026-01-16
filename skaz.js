(function () {
    'use strict';

    function SkazLite(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var results = [];
        var sources = {};
        var current_source = '';
        var balanser_name = '';

        // НАСТРОЙКИ АККАУНТА И СЕРВЕРА
        var SETTINGS = {
            url: 'http://online3.skaz.tv/',
            email: 'aklama@mail.ru',
            uid: 'guestn' // Или просто 'guest', если guestn не работает
        };

        // Формирование URL с подписью аккаунта
        this.account = function(url) {
            if (url.indexOf('account_email=') == -1) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(SETTINGS.email));
            if (url.indexOf('uid=') == -1) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(SETTINGS.uid));
            return url;
        };

        this.create = function() {
            var _this = this;

            // Обработка выбора в фильтре (смена балансера)
            filter.onSelect = function(type, a, b) {
                if (type == 'sort') {
                    // Сохраняем выбор
                    balanser_name = a.source;
                    Lampa.Storage.set('skaz_last_balanser', balanser_name);
                    
                    // Переключаем источник
                    current_source = sources[balanser_name].url;
                    _this.find();
                }
            };

            // Кнопка Назад
            filter.onBack = function() {
                Lampa.Activity.backward();
            };

            // Добавляем элементы на экран
            filter.render().find('.filter--sort span').text('Источник');
            scroll.body().addClass('torrent-list');
            files.appendFiles(scroll.render());
            files.appendHead(filter.render());
            
            // Загрузка
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));
            
            return files.render();
        };

        // Инициализация плагина
        this.start = function() {
            var _this = this;
            Lampa.Controller.enable('content');

            // 1. Получаем ID (Kinopoisk / IMDB)
            this.getIds().then(function() {
                // 2. Запрашиваем список балансеров
                _this.loadBalansers();
            });
        };

        this.getIds = function() {
            var _this = this;
            return new Promise(function(resolve) {
                // Если ID уже есть в объекте movie, используем их
                if (object.movie.kinopoisk_id || object.movie.imdb_id) return resolve();

                // Иначе запрашиваем через API
                var url = _this.account(SETTINGS.url + 'externalids?id=' + object.movie.id);
                network.silent(url, function(json) {
                    if (json.kinopoisk_id) object.movie.kinopoisk_id = json.kinopoisk_id;
                    if (json.imdb_id) object.movie.imdb_id = json.imdb_id;
                    resolve();
                }, resolve);
            });
        };

        this.loadBalansers = function() {
            var _this = this;
            var url = SETTINGS.url + 'lite/events';
            
            // Добавляем параметры поиска
            var query = [];
            if(object.movie.kinopoisk_id) query.push('kinopoisk_id=' + object.movie.kinopoisk_id);
            if(object.movie.imdb_id) query.push('imdb_id=' + object.movie.imdb_id);
            query.push('title=' + encodeURIComponent(object.movie.title));
            query.push('original_title=' + encodeURIComponent(object.movie.original_title));
            
            url = this.account(url + '?' + query.join('&'));

            network.silent(url, function(json) {
                if (json.accsdb) {
                    _this.empty(json.msg || 'Ошибка доступа к аккаунту');
                } else if (json.online && json.online.length) {
                    _this.buildFilter(json.online);
                } else {
                    _this.empty('Источники не найдены');
                }
            }, function() {
                _this.empty('Ошибка подключения к серверу');
            });
        };

        this.buildFilter = function(online_list) {
            var _this = this;
            var filter_items = [];
            
            // Собираем доступные балансеры
            online_list.forEach(function(item) {
                // Берем имя балансера (Filmix, Rezka и т.д.)
                var name = (item.balanser || item.name).toLowerCase();
                
                sources[name] = {
                    name: item.name,
                    url: item.url
                };
                
                filter_items.push({
                    title: item.name,
                    source: name,
                    selected: false
                });
            });

            if (filter_items.length === 0) return this.empty('Нет доступных балансеров');

            // Восстанавливаем последний выбор
            var last = Lampa.Storage.get('skaz_last_balanser', '');
            var active = filter_items.find(f => f.source == last) ? last : filter_items[0].source;

            // Помечаем активный
            filter_items.forEach(f => f.selected = (f.source === active));
            
            // Обновляем фильтр
            filter.set('sort', filter_items);
            filter.chosen('sort', [sources[active].name]);
            
            // Устанавливаем текущий источник и ищем видео
            balanser_name = active;
            current_source = sources[active].url;
            
            // Убираем лоадер и показываем контент
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
            
            // Простейший парсинг HTML ответа (как в o.js/swo.js)
            var content = $(str).find('.videos__item');
            
            if (content.length) {
                content.each(function() {
                    var element = $(this);
                    
                    // Перехват клика для воспроизведения
                    element.on('hover:enter', function() {
                        var data = element.data('json'); // Получаем JSON из data-атрибута
                        
                        if (data && data.url) {
                            if (data.method == 'play' || data.method == 'call') {
                                // Если это прямая ссылка на видео
                                Lampa.Player.play(data);
                            } else if (data.method == 'link') {
                                // Если это папка/сезон - загружаем содержимое
                                current_source = data.url;
                                _this.find();
                            }
                        }
                    });
                    
                    scroll.append(element);
                });
            } else {
                 // Иногда сервер возвращает JSON с ошибкой
                try {
                    var json = JSON.parse(str);
                    if (json.msg) _this.empty(json.msg);
                    else _this.empty('Пустой ответ');
                } catch(e) {
                    _this.empty('Контент не найден');
                }
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

        // Добавляем кнопку запуска
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                var btn = $('<div class="full-start__button selector view--online" data-subtitle="Skaz Lite"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.14 2.86l-3.37 1.83C12.35 4.93 12 5.37 12 5.86v13.06c0 1.05 1.15 1.69 2.05 1.15l8.67-5.2c.86-.52.86-1.78 0-2.3l-5.63-3.38V5.86c0-.42-.23-.81-.6-1.02l-4.35-1.98z" fill="white"/><path opacity="0.4" d="M12.77 4.69l-3.37-1.83a1.18 1.18 0 0 0-1.09 0l-5.63 3.38c-.86.52-.86 1.78 0 2.3l8.67 5.2c.9.54 2.05-.1 2.05-1.15V5.86c0-.49-.35-.93-.63-1.17z" fill="white"/></svg><span>SkazLite</span></div>');

                btn.on('hover:enter', function () {
                    Lampa.Component.add('skaz_lite', SkazLite);
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
