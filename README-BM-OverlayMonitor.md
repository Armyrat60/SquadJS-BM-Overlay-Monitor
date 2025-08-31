# BM-OverlayMonitor Plugin

## Description
The BM-OverlayMonitor plugin monitors admin commands, camera usage, and game state in SquadJS, sending real-time data to a Cloudflare Worker for BM Overlay integration. This plugin automatically detects your server ID from the main SquadJS configuration and provides comprehensive admin activity tracking with advanced features like disconnect handling and auto-updates.

## Features
- **Admin Command Monitoring**: Tracks `!admin` commands from players
- **Admin Camera Tracking**: Monitors when admins enter/exit admin camera with duration
- **Game State Monitoring**: Tracks new games, round starts, and round endings
- **Real-time Data**: Sends data immediately to Cloudflare Worker with retry logic
- **Auto Server ID**: Automatically detects server identifier from main config
- **Memory Management**: Prevents memory leaks with configurable session history limits
- **Error Handling**: Comprehensive error handling with exponential backoff retry
- **SquadJS 4.1.0 Compatible**: Fully tested and working with latest SquadJS versions
- **Auto-Updater Integration**: Automatic GitHub updates with Discord notifications
- **Disconnect Tracking**: Handles admin disconnections while in admin camera
- **Plugin Integration**: Seamless integration with admin-camera-warnings plugin
- **Ignore List Support**: Respects ignore lists for stealth monitoring

## Requirements
- **SquadJS**: Version 4.1.0 or higher (fully tested)
- **Cloudflare Worker**: A configured Cloudflare Worker to receive data
- **API Key**: Valid API key for Cloudflare Worker authentication
- **Internet Connection**: Required for API communication and auto-updates
- **Optional**: admin-camera-warnings plugin for ignore list integration

## Installation
1. Copy `BM-OverlayMonitor.js` to your `squad-server/plugins/` folder
2. Copy `auto-updater.js` to your `squad-server/utils/` folder (if not already present)
3. Add the configuration below to your `config.json`
4. Configure your Cloudflare Worker URL and API key
5. Restart SquadJS
6. Verify the plugin loads successfully in the SquadJS console

## Configuration

### Basic Configuration (Recommended)
```json
{
  "plugin": "BM-OverlayMonitor",
  "enabled": true,
  "cloudflareWorkerUrl": "https://squadjs-admin-monitor-worker.itsdast0m.workers.dev",
  "workerApiKey": "your-secure-api-key-here",
  "updateInterval": 15000,
  "maxCameraSessionsHistory": 50,
  "retryAttempts": 3,
  "disconnectTimeoutSeconds": 30
}
```

### Advanced Configuration
```json
{
  "plugin": "BM-OverlayMonitor",
  "enabled": true,
  "cloudflareWorkerUrl": "https://your-worker.workers.dev",
  "workerApiKey": "your-secure-api-key-here",
  "serverIdentifier": "custom_server_name",
  "updateInterval": 15000,
  "maxCameraSessionsHistory": 50,
  "retryAttempts": 5,
  "disconnectTimeoutSeconds": 30
}
```

## Auto-Updater Integration

The plugin includes automatic GitHub updates with the following features:

### Auto-Update Features
- **Automatic Updates**: Checks GitHub releases for new versions
- **Startup Check**: Waits 15 seconds after SquadJS initialization, then checks for updates
- **Periodic Checks**: Automatically checks for updates every 30 minutes
- **Discord Integration**: Emits events for AutoUpdatePlugin Discord notifications
- **Backup System**: Creates organized backups before applying updates
- **Restart Notifications**: Informs when SquadJS restart is required

### GitHub Repository Setup
- **Repository**: `https://github.com/Armyrat60/SquadJS-BM-OverlayMonitor`
- **Version Tagging**: Uses semantic versioning (v1.0.0, v1.0.1, etc.)
- **Public Repository**: Must be public for GitHub API access

### Manual Update Command
Admins can use the in-game command `!bmupdate` to manually check for updates:
- Requires admin permissions
- Provides immediate feedback on update status
- Triggers Discord notifications if AutoUpdatePlugin is configured

## Plugin Integration

### admin-camera-warnings Plugin Integration
The BM-OverlayMonitor automatically integrates with the admin-camera-warnings plugin:

- **Ignore List Support**: Respects the ignore list from admin-camera-warnings
- **Stealth Monitoring**: Admins in the ignore list won't appear in BM Overlay
- **Automatic Detection**: Automatically detects if the plugin is available
- **Graceful Fallback**: Works normally if admin-camera-warnings is not present

### Configuration for Ignore List
In your admin-camera-warnings plugin config:
```json
{
  "plugin": "admin-camera-warnings",
  "enableIgnoreRole": true,
  "ignoreRoleSteamIDs": ["STEAM_ID_1", "STEAM_ID_2"],
  "ignoreRoleEOSIDs": ["EOS_ID_1", "EOS_ID_2"]
}
```

The BM-OverlayMonitor will automatically respect these ignore lists.

## Data Events

### Admin Command Event
Triggered when a player uses `!admin` command:
```json
{
  "type": "admin_command",
  "serverIdentifier": "server_1",
  "timestamp": 1703123456789,
  "admin": {
    "name": "PlayerName",
    "steamID": "76561198123456789",
    "eosID": "1234567890123456789",
    "teamID": 1,
    "squadID": 2
  },
  "command": "admin",
  "message": "",
  "chat": "ChatAll"
}
```

### Admin Camera Enter Event
Triggered when an admin enters admin camera:
```json
{
  "type": "admin_camera_enter",
  "serverIdentifier": "server_1",
  "timestamp": 1703123456789,
  "admin": {
    "name": "AdminName",
    "steamID": "76561198123456789",
    "eosID": "1234567890123456789",
    "teamID": 1,
    "squadID": 0
  },
  "action": "entered_admin_camera"
}
```

### Admin Camera Exit Event
Triggered when an admin exits admin camera:
```json
{
  "type": "admin_camera_exit",
  "serverIdentifier": "server_1",
  "timestamp": 1703123456789,
  "admin": {
    "name": "AdminName",
    "steamID": "76561198123456789",
    "eosID": "1234567890123456789",
    "teamID": 1,
    "squadID": 0
  },
  "action": "exited_admin_camera",
  "duration": 45000
}
```

### Admin Camera Disconnect Event
Triggered when an admin disconnects while in admin camera:
```json
{
  "type": "admin_camera_disconnect",
  "serverIdentifier": "server_1",
  "timestamp": 1703123456789,
  "admin": {
    "name": "AdminName",
    "steamID": "76561198123456789",
    "eosID": "1234567890123456789",
    "teamID": 1,
    "squadID": 0
  },
  "action": "disconnected_in_admin_camera",
  "activeAdminsInCamera": 2
}
```

### Admin Camera Reconnect Event
Triggered when an admin reconnects after disconnecting:
```json
{
  "type": "admin_camera_reconnect",
  "serverIdentifier": "server_1",
  "timestamp": 1703123456789,
  "admin": {
    "name": "AdminName",
    "steamID": "76561198123456789",
    "eosID": "1234567890123456789",
    "teamID": 1,
    "squadID": 0
  },
  "action": "reconnected_after_disconnect",
  "activeAdminsInCamera": 3
}
```

### Admin Camera Cleanup Event
Triggered when an orphaned session is cleaned up:
```json
{
  "type": "admin_camera_cleanup",
  "serverIdentifier": "server_1",
  "timestamp": 1703123456789,
  "admin": {
    "name": "AdminName",
    "steamID": "76561198123456789",
    "eosID": "1234567890123456789",
    "teamID": 0,
    "squadID": 0
  },
  "action": "session_cleaned_up_after_disconnect",
  "sessionDuration": 30000,
  "activeAdminsInCamera": 2
}
```

### New Game Event
Triggered when a new game starts:
```json
{
  "type": "new_game",
  "serverIdentifier": "server_1",
  "timestamp": 1703123456789,
  "gameState": {
    "status": "active",
    "startTime": 1703123456789,
    "endTime": null,
    "layer": "Al Basrah AAS v1",
    "roundNumber": 5
  },
  "layer": {
    "name": "Al Basrah AAS v1",
    "classname": "BP_MP_AlBasrah_AAS_v1_C",
    "id": "AlBasrah_AAS_v1"
  },
  "serverInfo": {
    "playerCount": 78,
    "maxPlayers": 100,
    "serverName": "Your Server Name"
  }
}
```

### Round Ended Event
Triggered when a round ends:
```json
{
  "type": "round_ended",
  "serverIdentifier": "server_1",
  "timestamp": 1703123456789,
  "gameState": {
    "status": "ended",
    "startTime": 1703123456789,
    "endTime": 1703123556789,
    "layer": "Al Basrah AAS v1",
    "roundNumber": 5
  },
  "roundDuration": 100000,
  "serverInfo": {
    "playerCount": 82,
    "maxPlayers": 100,
    "serverName": "Your Server Name"
  }
}
```

### Current State Event (Periodic)
Sent every `updateInterval` milliseconds:
```json
{
  "type": "current_state",
  "serverIdentifier": "server_1",
  "timestamp": 1703123456789,
  "gameState": {
    "status": "active",
    "startTime": 1703123456789,
    "endTime": null,
    "layer": "Al Basrah AAS v1",
    "roundNumber": 5
  },
  "adminActivity": {
    "lastAdminCommand": {...},
    "adminsInCamera": ["1234567890123456789"],
    "cameraSessions": [...],
    "disconnectTracking": {
      "activeTimeouts": 1,
      "orphanedSessions": 1
    }
  },
  "serverInfo": {
    "playerCount": 78,
    "maxPlayers": 100,
    "serverName": "Your Server Name",
    "currentLayer": "Al Basrah AAS v1",
    "nextLayer": "Anvil AAS v1"
  }
}
```

## Disconnect Tracking

### How It Works
The plugin automatically tracks admin disconnections while in admin camera:

1. **Disconnect Detection**: When an admin disconnects while in admin camera
2. **Timeout Setting**: Sets a configurable timeout (default: 30 seconds)
3. **Reconnection Handling**: If admin reconnects, session is restored
4. **Cleanup Process**: If timeout expires, session is marked as orphaned
5. **Data Updates**: All events are sent to Cloudflare Worker with updated counts

### Configuration Options
- **`disconnectTimeoutSeconds`**: How long to wait before cleaning up disconnected sessions
- **Default**: 30 seconds
- **Range**: 10-300 seconds recommended

### Benefits
- **Accurate Counts**: Always shows correct number of active admins in camera
- **Crash Recovery**: Handles game crashes, Alt+F4, and network disconnections
- **Session Tracking**: Maintains complete session history including orphaned sessions
- **Real-time Updates**: Immediate notifications when admins disconnect/reconnect

## Cloudflare Worker Integration

### API Endpoint
All data is sent to: `POST {cloudflareWorkerUrl}/api/update`

### Headers
- `Content-Type: application/json`
- `X-API-Key: {workerApiKey}`
- `User-Agent: SquadJS-BMOverlayMonitor/{serverIdentifier}`

### Response Handling
- **Success**: HTTP 200-299 status codes
- **Failure**: HTTP 4xx/5xx status codes trigger retry logic
- **Retry**: Exponential backoff with configurable attempts

## Server ID Auto-Detection

The plugin automatically detects your server identifier from the main SquadJS configuration:

- **Main Config**: `"server": { "id": 1, ... }`
- **Auto-Generated**: `serverIdentifier: "server_1"`
- **Manual Override**: You can still set a custom `serverIdentifier` if needed

## Memory Management

The plugin includes built-in memory management:
- **Camera Sessions**: Limited to `maxCameraSessionsHistory` entries
- **Periodic Cleanup**: Old sessions are automatically removed
- **Map Usage**: Efficient tracking of active admin camera users
- **Timeout Cleanup**: Automatic cleanup of disconnect timeouts
- **Orphaned Session Management**: Efficient handling of disconnected sessions

## Error Handling

### Comprehensive Error Handling
- **API Failures**: Automatic retry with exponential backoff
- **Missing Data**: Graceful handling of incomplete player information
- **Network Issues**: Timeout protection and connection error handling
- **Logging**: Detailed verbose logging for debugging
- **Plugin Integration**: Graceful fallback when admin-camera-warnings is unavailable

### Retry Logic
- **Attempts**: Configurable retry attempts (default: 3)
- **Backoff**: Exponential backoff: 1s, 2s, 4s delays
- **Logging**: Each retry attempt is logged for monitoring

## Troubleshooting

### Common Issues

**Plugin won't start:**
- Verify `cloudflareWorkerUrl` and `workerApiKey` are set
- Check that your Cloudflare Worker is accessible
- Ensure SquadJS version compatibility (4.1.0+)

**Plugin loads but shows "Plugin does not exist" error:**
- Ensure the plugin file is named exactly `BM-OverlayMonitor.js`
- Check that the class has the correct static `name` property
- Verify the plugin is in the correct `squad-server/plugins/` directory

**Plugin loads but gets HTTP 401 errors:**
- Verify your `workerApiKey` is correct and matches the Cloudflare Worker
- Check that your Cloudflare Worker is configured to accept the `X-API-Key` header
- Test the API endpoint manually to verify authentication
- Ensure the Worker is running and accessible

**No data being sent:**
- Check Cloudflare Worker logs for API errors
- Verify API key authentication
- Check network connectivity
- Look for retry attempts in the SquadJS console

**Memory usage high:**
- Reduce `maxCameraSessionsHistory` value
- Increase `updateInterval` to reduce data frequency
- Check for orphaned sessions in disconnect tracking

**Auto-updates not working:**
- Verify GitHub repository exists and is public
- Check that releases are tagged with version numbers (v1.0.0, v1.0.1, etc.)
- Ensure internet connectivity for GitHub API access
- Check SquadJS console for auto-update error messages

**Ignore list not working:**
- Verify admin-camera-warnings plugin is loaded and configured
- Check that `enableIgnoreRole` is set to `true`
- Ensure Steam IDs and EOS IDs are properly formatted
- Check plugin console messages for integration status

### Debug Mode
Enable verbose logging in your SquadJS config:
```json
"logger": {
  "verboseness": {
    "BM-OverlayMonitor": 2
  }
}
```

### Plugin Loading Verification
When the plugin loads successfully, you should see these messages in the SquadJS console:
```
[Plugins][1] Loading plugin file BM-OverlayMonitor.js...
[SquadServerFactory][1] Initialising BM-OverlayMonitor...
[BM-OverlayMonitor][1] Auto-detected server identifier: server_1
[BM-OverlayMonitor][1] ✅ Found admin-camera-warnings plugin, will use its ignore list
[BM-OverlayMonitor][1] ⏳ Waiting for SquadJS to fully initialize before checking for updates...
[BM-OverlayMonitor][1] 🔄 Checking for updates... Current version: v1.0.0
[BM-OverlayMonitor][1] ✅ Plugin is up to date or no update needed
[BM-OverlayMonitor][1] ⏰ Auto-update checks scheduled every 30 minutes
[BM-OverlayMonitor][1] BMOverlayMonitor mounted for server_1
```

## Performance Considerations

- **Update Interval**: 5 seconds default provides good balance of real-time data vs. performance
- **Session History**: 50 sessions default prevents memory bloat
- **Retry Attempts**: 3 attempts provide reliability without excessive delays
- **Network Timeout**: 5 second timeout prevents hanging connections
- **Memory Efficient**: Uses Map for active admin tracking and automatic cleanup
- **Disconnect Timeout**: 30 seconds provides balance between accuracy and cleanup
- **Auto-Update Frequency**: 30-minute intervals minimize GitHub API usage

## Security Features

- **API Key Authentication**: Secure API key validation
- **No Sensitive Data**: Only game and admin activity data is sent
- **Configurable**: All sensitive settings must be provided in config
- **Validation**: Required options are validated on startup
- **Ignore List Support**: Respects privacy settings from admin-camera-warnings plugin
- **Stealth Mode**: Admins can be completely hidden from BM Overlay tracking

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review SquadJS logs for error messages
3. Verify Cloudflare Worker configuration
4. Ensure all required options are properly set
5. Check the plugin loading verification section for expected console output
6. Verify GitHub repository setup for auto-updates
7. Check admin-camera-warnings plugin configuration for ignore list issues

### Testing Your Setup
To verify your Cloudflare Worker is working correctly, test the API endpoint:
```bash
curl -X POST "https://squadjs-admin-monitor-worker.itsdast0m.workers.dev/api/update" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-actual-api-key-here" \
  -d '{"test": "data"}'
```

If you get a 401 error, the API key is incorrect. If you get a 200 response, the Worker is working correctly.

### Testing Auto-Updates
To test the auto-update functionality:
1. Use the `!bmupdate` command in-game (requires admin permissions)
2. Check SquadJS console for update check messages
3. Verify GitHub repository has proper releases tagged
4. Check Discord notifications if AutoUpdatePlugin is configured

## Version History

- **v1.0.0**: Initial release with admin monitoring and Cloudflare Worker integration
- **v1.1.0**: Added auto server ID detection and improved error handling
- **v1.2.0**: Enhanced memory management and performance optimizations
- **v1.3.0**: Fixed SquadJS 4.1.0 compatibility and plugin loading issues
- **v1.4.0**: Added auto-updater integration with GitHub updates
- **v1.5.0**: Added disconnect tracking for admin camera sessions
- **v1.6.0**: Added admin-camera-warnings plugin integration and ignore list support

---

**Note**: This plugin is designed for BM Overlay integration and provides comprehensive admin activity monitoring for SquadJS servers with advanced features like auto-updates, disconnect tracking, and stealth monitoring support.

