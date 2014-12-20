# Tether

A game about swinging a ball around. Play on
[colons.co](https://colons.co/tether/).

If you are determined to play locally, you'll need to serve it with a HTTP
server capable of HTTP/1.1 (which explicitly excludes Python's SimpleHTTPServer
module) to get the music to play back correctly, and you'll need to run
`./compress_bgm.sh bgm` (which requires [lame] and [id3tool]) to make an MP3
fit for looping.

[lame]: http://lame.sourceforge.net/
[id3tool]: http://nekohako.xware.cx/id3tool/

----

Game code and music released under a Creative Commons
[Attribution-NonCommercial][by-nc] license.

[by-nc]: https://creativecommons.org/licenses/by-nc/4.0/
