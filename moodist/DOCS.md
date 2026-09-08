# Moodist

Moodist layers ambient sounds and sends the resulting mix to this browser, one
or more Home Assistant speakers, or speaker groups.

## Installation

1. Add `https://github.com/jpinz/moodist` as a Home Assistant add-on repository.
2. Install and start **Moodist**.
3. Open its web UI and choose **Menu → Audio output**.
4. Select **This browser**, any listed speakers or groups, or a combination.

The add-on exposes port `8099` so speakers on your local network can reach its
audio stream.

## Audio URL

Moodist normally builds the speaker stream URL from the hostname used to open
Home Assistant. If that hostname is not reachable by your speakers, set the
`audio_url` option to the add-on's local URL, for example:

```yaml
audio_url: http://192.168.1.10:8099
```

Use the Home Assistant host's local IP address and keep port `8099`. Do not use
the add-on's ingress URL because speakers cannot authenticate to it.

## Supported outputs

- The browser running Moodist
- `media_player` entities
- Home Assistant groups containing `media_player` entities
- Any combination of the above

Home Assistant output requires speakers that can play a continuous MP3 stream.
