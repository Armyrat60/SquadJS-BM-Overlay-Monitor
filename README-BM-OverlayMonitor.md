# BM-OverlayMonitor Plugin  Guide

## Overview

The BM-OverlayMonitor plugin is a SquadJS plugin that monitors admin activity and game state, sending real-time data to a Cloudflare Worker for BM Overlay integration. This document explains the plugin's functionality and data structure for frontend developers.

## Plugin Purpose

The plugin acts as a data bridge between SquadJS (Squad game server management) and BM Overlay (BattleMetrics overlay system), providing real-time monitoring of:

- Admin commands and activity
- Admin camera usage with duration tracking
- Game state changes (rounds, layers, etc.)
- Player connection/disconnection events
- Server status and player counts

## Data Flow

```
SquadJS Server → BM-OverlayMonitor Plugin → Cloudflare Worker → Frontend/BM Overlay
```

## Event Types & Data Structures

The plugin sends the following event types to the Cloudflare Worker:

### 1. Admin Command Events
**Event Type**: `admin_command`

```json
{
  "type": "admin_command",
  "serverIdentifier": "server_12345",
  "timestamp": 1703123456789,
  "admin": {
    "name": "PlayerName",
    "steamID": "76561198012345678",
    "eosID": "abc123def456",
    "teamID": 1,
    "squadID": 2
  },
  "command": "admin",
  "message": "Player requested admin access",
  "chat": "Team"
}
```

### 2. Admin Camera Enter Events
**Event Type**: `admin_camera_enter`

```json
{
  "type": "admin_camera_enter",
  "serverIdentifier": "server_12345",
  "timestamp": 1703123456789,
  "admin": {
    "name": "AdminName",
    "steamID": "76561198012345678",
    "eosID": "abc123def456",
    "teamID": 1,
    "squadID": 2
  },
  "action": "entered_admin_camera"
}
```

### 3. Admin Camera Exit Events
**Event Type**: `admin_camera_exit`

```json
{
  "type": "admin_camera_exit",
  "serverIdentifier": "server_12345",
  "timestamp": 1703123456789,
  "admin": {
    "name": "AdminName",
    "steamID": "76561198012345678",
    "eosID": "abc123def456",
    "teamID": 1,
    "squadID": 2
  },
  "action": "exited_admin_camera",
  "duration": 45000
}
```

### 4. New Game Events
**Event Type**: `new_game`

```json
{
  "type": "new_game",
  "serverIdentifier": "server_12345",
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
    "classname": "AlBasrahAASv1",
    "id": "12345"
  },
  "serverInfo": {
    "playerCount": 78,
    "maxPlayers": 100,
    "serverName": "My Squad Server"
  }
}
```

### 5. Round Ended Events
**Event Type**: `round_ended`

```json
{
  "type": "round_ended",
  "serverIdentifier": "server_12345",
  "timestamp": 1703123456789,
  "gameState": {
    "status": "ended",
    "startTime": 1703120000000,
    "endTime": 1703123456789,
    "layer": "Al Basrah AAS v1",
    "roundNumber": 5
  },
  "roundDuration": 3456789,
  "serverInfo": {
    "playerCount": 78,
    "maxPlayers": 100,
    "serverName": "My Squad Server"
  }
}
```

### 6. Disconnect Events
**Event Type**: `admin_camera_disconnect`

```json
{
  "type": "admin_camera_disconnect",
  "serverIdentifier": "server_12345",
  "timestamp": 1703123456789,
  "admin": {
    "name": "AdminName",
    "steamID": "76561198012345678",
    "eosID": "abc123def456",
    "teamID": 1,
    "squadID": 2
  },
  "action": "disconnected_in_admin_camera",
  "detectedBy": "event",
  "activeAdminsInCamera": 2
}
```

**Note**: The `detectedBy` field indicates how the disconnect was detected:
- `"event"` - Detected via SquadJS PLAYER_DISCONNECTED event (normal disconnection)
- `"periodic_check"` - Detected via periodic polling (Alt+F4, crash, or network issues)

### 7. Reconnect Events
**Event Type**: `admin_camera_reconnect`

```json
{
  "type": "admin_camera_reconnect",
  "serverIdentifier": "server_12345",
  "timestamp": 1703123456789,
  "admin": {
    "name": "AdminName",
    "steamID": "76561198012345678",
    "eosID": "abc123def456",
    "teamID": 1,
    "squadID": 2
  },
  "action": "reconnected_after_disconnect",
  "activeAdminsInCamera": 3
}
```

### 8. Session Cleanup Events
**Event Type**: `admin_camera_cleanup`

```json
{
  "type": "admin_camera_cleanup",
  "serverIdentifier": "server_12345",
  "timestamp": 1703123456789,
  "admin": {
    "name": "AdminName",
    "steamID": "76561198012345678",
    "eosID": "abc123def456",
    "teamID": 0,
    "squadID": 0
  },
  "action": "session_cleaned_up_after_disconnect",
  "sessionDuration": 120000,
  "detectedBy": "periodic_check",
  "activeAdminsInCamera": 2
}
```

**Note**: The `detectedBy` field indicates how the original disconnect was detected:
- `"event"` - Detected via SquadJS PLAYER_DISCONNECTED event
- `"periodic_check"` - Detected via periodic polling (Alt+F4, crash, or network issues)

### 9. Current State Events (Periodic Updates)
**Event Type**: `current_state`

```json
{
  "type": "current_state",
  "serverIdentifier": "server_12345",
  "timestamp": 1703123456789,
  "gameState": {
    "status": "active",
    "startTime": 1703120000000,
    "endTime": null,
    "layer": "Al Basrah AAS v1",
    "roundNumber": 5
  },
  "adminActivity": {
    "lastAdminCommand": { /* admin_command object */ },
    "adminsInCamera": ["abc123def456", "def456ghi789"],
    "cameraSessions": [
      {
        "admin": "AdminName",
        "duration": 45000,
        "timestamp": 1703123456789
      }
    ],
    "disconnectTracking": {
      "activeTimeouts": 1,
      "orphanedSessions": 1
    }
  },
  "serverInfo": {
    "playerCount": 78,
    "maxPlayers": 100,
    "serverName": "My Squad Server",
    "currentLayer": "Al Basrah AAS v1",
    "nextLayer": "Fallujah AAS v1"
  }
}
```

## Data Field Descriptions

### Common Fields
- **`type`**: Event type identifier
- **`serverIdentifier`**: Unique server identifier (auto-generated as `server_{server.id}`)
- **`timestamp`**: Unix timestamp in milliseconds

### Admin Object
- **`name`**: Player's display name
- **`steamID`**: Steam ID (64-bit)
- **`eosID`**: Epic Online Services ID (primary identifier)
- **`teamID`**: Team ID (1 = US, 2 = RU, etc.)
- **`squadID`**: Squad ID (0 = unassigned)

### Game State Object
- **`status`**: Game status (`waiting`, `active`, `ended`)
- **`startTime`**: Round start timestamp
- **`endTime`**: Round end timestamp (null if active)
- **`layer`**: Current map/layer name
- **`roundNumber`**: Incremental round counter

### Server Info Object
- **`playerCount`**: Current connected players
- **`maxPlayers`**: Maximum server capacity
- **`serverName`**: Server display name
- **`currentLayer`**: Current map name
- **`nextLayer`**: Next map in rotation

## API Endpoint

The plugin sends data to: `{cloudflareWorkerUrl}/api/update`

**Headers:**
- `Content-Type: application/json`
- `X-API-Key: {workerApiKey}`
- `User-Agent: SquadJS-BMOverlayMonitor/{serverIdentifier}`

**Method:** POST

## Configuration Requirements

The plugin requires these configuration options:

```json
{
  "cloudflareWorkerUrl": "https://your-worker.workers.dev",
  "workerApiKey": "your-secure-api-key",
  "serverIdentifier": "optional-custom-identifier",
  "updateInterval": 5000,
  "maxCameraSessionsHistory": 50,
  "retryAttempts": 3,
  "disconnectTimeoutSeconds": 30,
  "disconnectCheckInterval": 10000
}
```

## UpdateManager Integration

The plugin uses the centralized UpdateManager system for automatic updates:

### Auto-Update Features
- **Centralized Management**: Uses UpdateManager for coordinated updates across all plugins
- **Automatic Updates**: Checks GitHub releases for new versions
- **Periodic Checks**: Automatically checks for updates every 30 minutes (configurable)
- **Discord Integration**: Integrates with UpdateManagerPlugin's Discord notification system
- **Backup System**: Creates organized backups before applying updates
- **Restart Notifications**: Informs when SquadJS restart is required

### Manual Update Command
Admins can use the in-game command `!bmupdate` to manually check for updates:
- Requires admin permissions
- Provides immediate feedback on update status
- Shows overall update status for all registered plugins
- Integrates with UpdateManager's centralized system

## Error Handling

The plugin includes robust error handling:
- **Retry Logic**: Exponential backoff for failed requests (up to 3 attempts)
- **Timeout Handling**: 5-second timeout for API requests
- **Data Validation**: Checks for required fields before sending
- **Memory Management**: Prevents memory leaks with configurable limits

## Update Frequency

- **Real-time Events**: Admin commands, camera enter/exit, game state changes
- **Periodic Updates**: Current state sent every 5 seconds (configurable)
- **Disconnect Handling**: 30-second timeout before cleanup (configurable)
- **Alt+F4 Detection**: Periodic polling every 10 seconds to detect missing admins (configurable)

## Integration Notes

1. **Player Identification**: Use `eosID` as the primary identifier for players
2. **Session Tracking**: Camera sessions are tracked by enter/exit events
3. **Disconnect Handling**: Orphaned sessions are cleaned up after timeout
4. **Memory Limits**: Session history is limited to prevent memory leaks
5. **Error Recovery**: Failed requests are retried with exponential backoff

## Frontend Considerations

When building the frontend:

1. **Real-time Updates**: Handle incoming events immediately for live monitoring
2. **State Management**: Track current game state and admin activity
3. **Session Duration**: Calculate camera session durations from enter/exit events
4. **Disconnect Handling**: Handle admin disconnections gracefully
5. **Alt+F4 Detection**: Handle both event-based and polling-based disconnect detection
6. **Data Persistence**: Consider storing historical data for analytics
7. **Error States**: Handle API failures and network issues
8. **Multiple Servers**: Support multiple server identifiers if needed

## Example Frontend Data Flow

```javascript
// Example WebSocket/HTTP client handling
function handleBMOverlayEvent(event) {
  switch(event.type) {
    case 'admin_command':
      displayAdminRequest(event.admin, event.message);
      break;
    case 'admin_camera_enter':
      addAdminToCameraList(event.admin);
      break;
    case 'admin_camera_exit':
      removeAdminFromCameraList(event.admin, event.duration);
      break;
    case 'new_game':
      updateGameState(event.gameState, event.layer);
      break;
    case 'round_ended':
      finalizeRound(event.gameState, event.roundDuration);
      break;
    case 'current_state':
      updateServerStatus(event.serverInfo);
      updateAdminActivity(event.adminActivity);
      break;
  }
}
```

This plugin provides comprehensive admin activity monitoring for SquadJS servers with real-time data transmission to your Cloudflare Worker for BM Overlay integration.

