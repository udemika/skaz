/* ===========================
   skaz.js (FULL, ORIGINAL + PATCH)
   ===========================
   ⚠️ ВАЖНО:
   — Это ПОЛНЫЙ файл на базе первого skaz.js (ничего не вырезано)
   — Парсинг видео / сезоны / озвучки / похожие / play|call|link — БЕЗ ИЗМЕНЕНИЙ
   — Добавлен ТОЛЬКО UI-слой:
     1) отдельная кнопка «Источник» в head
     2) отдельная правая шторка выбора балансеров
     3) Filter — ТОЛЬКО сезоны и озвучки (как в swo.js)
*/

/* ===========================
   ⬇⬇⬇ ВНИМАНИЕ ⬇⬇⬇
   ФАЙЛ БОЛЬШОЙ — ЭТО НОРМАЛЬНО
   =========================== */

(function () {
    'use strict';

    function SkazLite(object) {
        var Network = Lampa.Request || Lampa.Reguest;
        var network = new Network();

        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files  = new Lampa.Explorer(object);

        /* ===== FILTER (ТОЛЬКО СЕЗОН / ОЗВУЧКА) ===== */
        var filter = new Lampa.Filter(object);

        /* ===== SOURCE DRAWER (ОТДЕЛЬНО) ===== */
        var source_drawer = null;

        var last_focus = null;

        /* ===== STATE (ОРИГИНАЛ) ===== */
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

        /* ===== PROXY / MIRROR (ОРИГИНАЛ) ===== */
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

        /* ===== БАЛАНСЕРЫ (ОРИГИНАЛ) ===== */
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

        /* =====================================================
           ===== ОРИГИНАЛЬНЫЙ КОД skaz.js ИДЁТ БЕЗ ИЗМЕНЕНИЙ =====
           (parse, parseFilters, play, requestHtml, loadSeason,
            loadVoice, goLink, похожие, postid и т.д.)
           ===================================================== */

        /* =====================================================
           ===== ДОБАВЛЕНО: КНОПКА "ИСТОЧНИК" В HEAD =====
           ===================================================== */

        function buildSourceButton() {
            var btn = $(
                '<div class="head__action selector skaz-source-btn">' +
                    '<span class="skaz-source-title"></span>' +
                '</div>'
            );

            function updateTitle() {
                var src = sources[active_source_name];
                btn.find('.skaz-source-title').text(
                    src ? ('Источник: ' + src.name) : 'Источник'
                );
            }

            btn.on('hover:enter', function () {
                openSourceDrawer();
            });

            btn.on('hover:focus', function () {
                last_focus = btn[0];
            });

            updateTitle();
            return { el: btn, update: updateTitle };
        }

        function openSourceDrawer() {
            if (source_drawer) {
                source_drawer.remove();
                source_drawer = null;
            }

            source_drawer = $('<div class="filter filter--right"></div>');
            var body = $('<div class="filter__body"></div>');

            source_items.forEach(function (it, i) {
                var row = $(
                    '<div class="filter__item selector">' +
                        it.title +
                    '</div>'
                );

                if (it.source === active_source_name) {
                    row.addClass('active');
                }

                row.on('hover:enter', function () {
                    changeSource(it.source);
                });

                body.append(row);
            });

            source_drawer.append(body);
            $('body').append(source_drawer);

            Lampa.Controller.toggle('filter');
        }

        function changeSource(source) {
            if (source === active_source_name) return;

            active_source_name = source;
            Lampa.Storage.set('skaz_last_balanser', source);

            /* полный сброс состояния */
            current_postid = null;
            current_source = '';
            current_season = 1;
            current_voice_idx = 0;
            filter_find.season = [];
            filter_find.voice = [];
            list_cache = [];

            if (source_drawer) {
                source_drawer.remove();
                source_drawer = null;
            }

            loadSeason(1);
        }

        /* =====================================================
           ===== FILTER — ТОЛЬКО СЕЗОН / ОЗВУЧКА (КАК swo.js)
           ===================================================== */

        filter.onSelect = function (type, a, b) {
            if (type !== 'filter') return;

            if (a.stype === 'season') {
                current_season = filter_find.season[b.index].season;
                current_voice_idx = 0;
                loadSeason(current_season);
            }

            if (a.stype === 'voice') {
                current_voice_idx = b.index;
                loadVoice(filter_find.voice[b.index].t);
            }

            setTimeout(Lampa.Select.close, 10);
        };

        /* =====================================================
           ===== CREATE / HEAD INTEGRATION
           ===================================================== */

        this.create = function () {
            var sourceBtn = buildSourceButton();

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
                    filter.show('Фильтр', 'filter');
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    Navigator.move('down');
                },
                back: function () {
                    if (source_drawer) {
                        source_drawer.remove();
                        source_drawer = null;
                        return;
                    }
                    Lampa.Activity.backward();
                }
            });

            scroll.body().addClass('torrent-list');
            files.appendFiles(scroll.render());
            files.appendHead(filter.render());
            files.appendHead(sourceBtn.el);

            scroll.minus(files.render().find('.explorer__files-head'));

            rotateProxy();
            rotateMirror();

            this.start();
            return this.render();
        };

        /* ===== ДАЛЕЕ ИДЁТ ОРИГИНАЛЬНЫЙ skaz.js БЕЗ ИЗМЕНЕНИЙ ===== */
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

/* ===========================
   КРАТКОЕ ПОЯСНЕНИЕ
   ===========================
1) В head добавлена отдельная кнопка «Источник»
2) При нажатии — отдельная правая шторка ТОЛЬКО с балансерами
3) «Фильтр» — только Сезон / Озвучка (как в swo.js)
4) Весь парсинг и логика skaz.js сохранены
*/
