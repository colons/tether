#!/usr/bin/env bash -e

rm bgm.mp3 || :

cp bgm.aif bgm_copy1.aif 
cp bgm.aif bgm_copy2.aif 

lame -V 0 --nogap bgm_copy1.aif bgm.aif bgm_copy2.aif
mv bgm.aif.mp3 bgm.mp3

rm bgm_copy*
