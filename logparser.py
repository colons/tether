from collections import defaultdict
import json
from urllib import unquote
from urlparse import urlparse

from apache_log_parser import Parser

parser = Parser("%h %l %u %t \"%r\" %>s %O \"%{Referer}i\" \"%{User-Agent}i\"")


class User(object):
    def __str__(self):
        return self.uid

    def __init__(self):
        self.sizes = set()
        self.achievements = set()
        self.highscore = 0

    def note_meta(self, meta):
        self.sizes.add((meta['width'], meta['height']))

    def note_state(self, data):
        if data['highScore'] < self.highscore:
            raise ValueError('highscore for {} went down from {} to {}'.format(
                self, self.highscore, data['highScore'],
            ))
        self.highscore = data['highScore']

    def note_score(self, data):
        if data['score'] > self.highscore:
            self.highscore = data['score']

    def note_achievement(self, data):
        self.achievements.add(data['achievement'])

    @classmethod
    def handle_line(cls, parsed):
        query = {
            unquote(k): unquote(v)
            for k, v in [
                q.split('=') for q in
                urlparse(parsed['request_url']).query.split('&')
            ]
        }
        data = json.loads(query['data'])
        try:
            meta = data.pop('meta')
        except KeyError:
            # prior to breaking out meta; we have to fake it :<
            meta = {
                'uid': data.pop('uid'),
                'width': None,
                'height': None,
            }
        user = UIDS[meta['uid']]
        user.uid = meta['uid']
        HOSTS[parsed['remote_host']].add(user)

        user.note_meta(meta)
        {
            'state': user.note_state,
            'achievement': user.note_achievement,
            'score': user.note_score,
        }[query['type']](data)


def parse_log(log):
    for line in log.readlines():
        parsed = parser.parse(line)
        if (
            parsed['request_url'].startswith('/tether/aq?') and
            (parsed['request_header_referer'] == 'https://colons.co/tether/')
        ):
            User.handle_line(parsed)


UIDS = defaultdict(User)
HOSTS = defaultdict(set)


def print_statistics():
    print '{} unique UIDs generated from {} different hosts'.format(
        len(UIDS), len(HOSTS),
    )

    print 'highest scores:'
    print '\n'.join([
        '  {u}: {highscore}'.format(u=u, **u.__dict__) for u in
        sorted(UIDS.itervalues(), key=lambda u: u.highscore, reverse=True)[:10]
    ])


if __name__ == '__main__':
    from sys import stdin
    parse_log(stdin)
    print_statistics()
