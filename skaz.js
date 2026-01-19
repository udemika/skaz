(function () {
    'use strict';

    function SkazLite(object) {
        var Network = Lampa.Request || Lampa.Reguest;
        var network = new Network();

        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files  = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);

        var last_focus = null;

        var sources = {};
        var source_items = [];
        var active_source_name = '';

        var current_source = '';
        var current_postid = null;
        var current_season = 1;
        var current_voice_idx = 0;

        var filter_find = {
            season: [],
            voice: []
        };

        var list_cache = [];

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

        function rotateProxy() {
            SETTINGS.current_proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
        }

        function rotateMirror() {
            SETTINGS.current_mirror = MIRRORS[Math.floor(Math.random() * MIRRORS.length)];
        }

        this.normalizeUrl = function (url) {
            return (url || '').toString().trim();
        };

        this.proxify = function (url) {
            if (!url) return '';
            if (url.indexOf('.mp4') > -1 || url.indexOf('.m3u8') > -1) return url;
            return SETTINGS.current_proxy + url;
        };

        this.account = function (url) {
            if (!url) return url;
            if (url.indexOf('account_email=') === -1) {
                url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(SETTINGS.email));
            }
            if (url.indexOf('uid=') === -1) {
                url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(SETTINGS.uid));
            }
            return url;
        };

        function showSystemList(title, items, cb) {
            Lampa.Select.show({
                title: title,
                items: items.map(function (it, i) {
                    return { title: it.title, index: i, selected: it.selected };
                }),
                onSelect: function (a) {
                    cb && cb(a.index);
                    setTimeout(Lampa.Select.close, 10);
                }
            });
        }

        function updateSourceFilter() {
            var items = source_items.map(function (s, i) {
                return { title: s.title, selected: s.source === active_source_name, index: i };
            });

            filter.set('filter', [{
                title: 'Источники',
                subtitle: sources[active_source_name] ? sources[active_source_name].name : '',
                items: items,
                stype: 'source'
            }]);

            filter.render();
        }

        filter.onSelect = function (type, a, b) {
            if (type === 'filter' && a.stype === 'source') {
                var picked = source_items[b.index];
                if (!picked) return;

                active_source_name = picked.source;
                Lampa.Storage.set('skaz_last_balanser', active_source_name);

                current_postid = null;
                current_source = '';
                current_season = 1;
                current_voice_idx = 0;
                filter_find.season = [];
                filter_find.voice = [];
                list_cache = [];

                loadSeason(1);
                setTimeout(Lampa.Select.close, 10);
            }
        };

        function buildBaseSourceUrl() {
            if (current_postid) {
                return SETTINGS.current_mirror + 'lite/' + active_source_name + '?postid=' + encodeURIComponent(current_postid);
            }
            return SETTINGS.current_mirror + 'lite/' + active_source_name;
        }

        function loadSeason(season) {
            var base = buildBaseSourceUrl();
            var url = base + '?s=' + season;
            url = plugin.account(url);
            url = plugin.proxify(url);

            scroll.clear();
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));

            network.native(url, function (html) {
                plugin.parse(html);
            }, function () {
                plugin.empty('Ошибка загрузки');
            }, false, { dataType: 'text' });
        }

        var plugin = this;

        this.parse = function (str) {
            var html = $(str);
            list_cache = [];

            html.find('.videos__item').each(function () {
                var el = $(this);
                var data = el.attr('data-json');
                if (!data) return;

                try { data = JSON.parse(data); } catch (e) { return; }

                if (data.method === 'link') {
                    list_cache.push({ title: el.text().trim(), type: 'link', url: data.url });
                } else if (data.method === 'play' || data.method === 'call') {
                    list_cache.push({ title: el.text().trim(), type: 'play', data: data });
                }
            });

            scroll.clear();

            if (list_cache.length) {
                showSystemList('Список', list_cache, function (idx) {
                    var it = list_cache[idx];
                    if (it.type === 'play') plugin.play(it.data);
                });
            } else {
                plugin.empty('Пусто');
            }
        };

        this.play = function (data) {
            if (!data || !data.url) return;
            var url = plugin.normalizeUrl(data.url);
            Lampa.Player.play({ title: data.title || 'Видео', url: url });
        };

        this.loadBalansers = function () {
            sources = {};
            source_items = [];

            DEFAULT_BALANSERS.forEach(function (item) {
                var name = item.balanser;
                if (!ALLOWED_BALANSERS[name]) return;

                sources[name] = { name: item.name };
                source_items.push({ title: item.name, source: name });
            });

            var last = Lampa.Storage.get('skaz_last_balanser', source_items[0].source);
            active_source_name = last;

            updateSourceFilter();
            loadSeason(1);
        };

        this.create = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                },
                right: function () {
                    filter.show('Фильтр', 'filter');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            scroll.body().addClass('torrent-list');
            files.appendFiles(scroll.render());
            files.appendHead(filter.render());
            scroll.minus(files.render().find('.explorer__files-head'));

            rotateProxy();
            rotateMirror();

            this.loadBalansers();
            return this.render();
        };

        this.render = function () {
            return files.render();
        };

        this.empty = function (msg) {
            scroll.clear();
            var html = Lampa.Template.get('lampac_does_not_answer', {});
            html.find('.online-empty__title').html(msg || 'Пусто');
            html.find('.online-empty__buttons').remove();
            scroll.append(html);
        };
    }

    function startPlugin() {
        if (window.plugin_skaz_lite_ready) return;
        window.plugin_skaz_lite_ready = true;

        Lampa.Component.add('skaz_lite', SkazLite);

        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                var btn = $('<div class="full-start__button selector view--online"><span>SkazLite</span></div>');
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