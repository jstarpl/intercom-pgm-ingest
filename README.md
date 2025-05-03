Intercom PGM Ingest
===

This is a utility that integrates with the [Intercom Manager](https://github.com/Eyevinn/intercom-manager/) from Eyevinn. It allows to join a Line as an "audio feed" source by ingesting an audio stream via FFmpeg. If not specified, it will select the first Line with the `programOutputLine` flag turned on.

It requires that `ffmpeg` be available in `PATH`.

Use:

```bash
Usage: index [options] [inputFileOrStream]

Options:
  -p, --productionId <productionId>  Production ID to connect to     
  -l, --lineId <lineId>              Line ID to connect to
  -u, --userName <userName>          Username to present as in the Line
  -s, --serverUrl <serverUrl>        Intercom Manager Server base URL (e.g. "http://localhost:8000")
  --apiPrefix <apiPrefix>            Intercom Manager API version prefix (default is "/api/v1") (default: "/api/v1")
  -f <inputFormat>                   Input format to use for ffmpeg (e.g. "alsa" or "jack")
  -v                                 Verbose output
  -h, --help                         display help for command 
```

Options `-p`, `-u`, `-s` are required. `-f` can be ommited if FFmpeg can auto-detect the format from `[inputFileOrStream]`.
