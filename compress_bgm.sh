#!/usr/bin/env bash -e

rm "$1".mp3 || :

cp "$1".aif "$1"_copy1.aif 
cp "$1".aif "$1"_copy2.aif 

lame -V 0 --nogap "$1"_copy1.aif "$1".aif "$1"_copy2.aif
mv "$1".aif.mp3 "$1".mp3

rm "$1"_copy*

id3tool "$1".mp3 -t 'Click to Retry' -a 'Tether' -r 'Nivi' -y '2014'
