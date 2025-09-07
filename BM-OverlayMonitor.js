// SquadJS BM Overlay Monitor Plugin - Fixed Version
import BasePlugin from './base-plugin.js';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { UpdateManager } from '../utils/update-manager.js';

// Plugin version and repository information
const PLUGIN_VERSION = 'v1.0.0';
const GITHUB_OWNER = 'Armyrat60';
const GITHUB_REPO = 'SquadJS-BM-Overlay-Monitor';

export default class BMOverlayMonitor extends BasePlugin {
  static get name() {
    return 'BM-OverlayMonitor';
  }

  static get description() {
    return 'Monitors admin commands, camera usage, and game state, sending data to Cloudflare Worker for BM Overlay. Auto-detects server ID from config.';
  }

  static get defaultEnabled() {
    return false; // Keep disabled by default for security
  }

  static get optionsSpecification() {
    return {
      cloudflareWorkerUrl: {
        required: true,
        description: 'Your Cloudflare Worker URL',
        default: '' // Remove hardcoded URL - must be set in config
      },
      workerApiKey: {
        required: true,
        description: 'API key for Cloudflare Worker authentication',
        default: '' // Remove hardcoded API key - must be set in config
      },
      serverIdentifier: {
        required: false,
        description: 'Unique identifier for this server (auto-detected from server.id if not provided)',
        default: null
      },
      updateInterval: {
        required: false,
        description: 'How often to send data (ms)',
        default: 5000 // Increased to 5 seconds to reduce load
      },
      maxCameraSessionsHistory: {
        required: false,
        description: 'Maximum number of camera sessions to keep in memory',
        default: 50
      },
      retryAttempts: {
        required: false,
        description: 'Number of retry attempts for failed API calls',
        default: 3
      },
      disconnectTimeoutSeconds: {
        required: false,
        description: 'Seconds to wait before cleaning up disconnected admin sessions',
        default: 30
      },
      disconnectCheckInterval: {
        required: false,
        description: 'How often to check for missing admins (ms) - helps detect Alt+F4 disconnects',
        default: 10000
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    
    // Validate required options
    if (!this.options.cloudflareWorkerUrl) {
      throw new Error('cloudflareWorkerUrl is required but not provided');
    }
    if (!this.options.workerApiKey) {
      throw new Error('workerApiKey is required but not provided');
    }
    
    // Auto-detect server identifier from server.id if not provided
    if (!this.options.serverIdentifier) {
      this.options.serverIdentifier = `server_${this.server.id}`;
      this.verbose(1, `Auto-detected server identifier: ${this.options.serverIdentifier}`);
    }
    
    // Try to get reference to admin-camera-warnings plugin for ignore list
    this.adminCameraWarningsPlugin = null;
    this.tryGetAdminCameraWarningsPlugin();
    
    // Register with UpdateManager
    const pluginPath = fileURLToPath(import.meta.url);
    this.updateInfo = UpdateManager.registerPlugin(
      'BM-OverlayMonitor',
      PLUGIN_VERSION,
      GITHUB_OWNER,
      GITHUB_REPO,
      pluginPath,
      (message, ...args) => this.verbose(1, message, ...args)
    );
    
    // Bind event handlers
    this.onChatCommand = this.onChatCommand.bind(this);
    this.onAdminCameraEnter = this.onAdminCameraEnter.bind(this);
    this.onAdminCameraExit = this.onAdminCameraExit.bind(this);
    this.onNewGame = this.onNewGame.bind(this);
    this.onRoundEnded = this.onRoundEnded.bind(this);
    this.onPlayerDisconnected = this.onPlayerDisconnected.bind(this);
    this.onPlayerConnected = this.onPlayerConnected.bind(this);
    
    // Data storage
    this.currentGameState = {
      status: 'waiting',
      startTime: null,
      endTime: null,
      layer: null,
      roundNumber: 0
    };
    
    this.adminActivity = {
      lastAdminCommand: null,
      adminsInCamera: new Map(), // Use Map to track enter times
      cameraSessions: []
    };
    
    // Disconnect tracking
    this.disconnectTimeouts = new Map(); // eosID -> timeout reference
    this.orphanedSessions = new Map(); // eosID -> orphaned session data
    this.lastKnownPlayers = new Set(); // Track last known player EOS IDs
    
    // Interval reference for cleanup
    this.updateInterval = null;
    this.disconnectCheckInterval = null;
    
    this.setupDataTransfer();
  }

  // Try to get reference to admin-camera-warnings plugin
  tryGetAdminCameraWarningsPlugin() {
    try {
      // Look for the plugin in the server's plugin list
      if (this.server.plugins) {
        for (const plugin of this.server.plugins) {
          if (plugin.constructor.name === 'AdminCameraWarnings') {
            this.adminCameraWarningsPlugin = plugin;
            this.verbose(1, '✅ Found admin-camera-warnings plugin, will use its ignore list');
            break;
          }
        }
      }
      
      if (!this.adminCameraWarningsPlugin) {
        this.verbose(1, '⚠️  admin-camera-warnings plugin not found, using fallback disconnect tracking only');
      }
    } catch (error) {
      this.verbose(1, 'Error trying to get admin-camera-warnings plugin:', error.message);
    }
  }

  // Check if a player should be ignored based on admin-camera-warnings plugin
  isPlayerIgnored(player) {
    if (!this.adminCameraWarningsPlugin) {
      return false; // No plugin available, don't ignore anyone
    }

    try {
      // Check if the plugin has the ignore functionality and if it's enabled
      if (this.adminCameraWarningsPlugin.options?.enableIgnoreRole) {
        const isSteamIDIgnored = this.adminCameraWarningsPlugin.options.ignoreRoleSteamIDs?.includes(player.steamID);
        const isEOSIDIgnored = this.adminCameraWarningsPlugin.options.ignoreRoleEOSIDs?.includes(player.eosID);
        
        if (isSteamIDIgnored || isEOSIDIgnored) {
          this.verbose(2, `Player ${player.name} is in ignore list, skipping BM Overlay tracking`);
          return true;
        }
      }
    } catch (error) {
      this.verbose(1, 'Error checking ignore list:', error.message);
    }
    
    return false;
  }

  async mount() {
    // Listen to admin chat command specifically
    this.server.on('CHAT_COMMAND:admin', this.onChatCommand);
    
    // Listen to admin camera events
    this.server.on('POSSESSED_ADMIN_CAMERA', this.onAdminCameraEnter);
    this.server.on('UNPOSSESSED_ADMIN_CAMERA', this.onAdminCameraExit);
    
    // Listen to game state events
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on('ROUND_ENDED', this.onRoundEnded);
    
    // Listen to player connection events for disconnect tracking
    this.server.on('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
    this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
    
    // Set up periodic disconnect checking for Alt+F4 detection
    this.setupDisconnectChecking();
    
    // Add test command for auto-updater
    this.server.on('CHAT_COMMAND:!bmupdate', this.onBmUpdateCommand.bind(this));
    
    this.verbose(1, `BMOverlayMonitor mounted for ${this.options.serverIdentifier}`);
    this.verbose(1, `📝 Registered with UpdateManager for automatic updates`);
  }

  async unmount() {
    // Clean up event listeners
    this.server.off('CHAT_COMMAND:admin', this.onChatCommand);
    this.server.off('POSSESSED_ADMIN_CAMERA', this.onAdminCameraEnter);
    this.server.off('UNPOSSESSED_ADMIN_CAMERA', this.onAdminCameraExit);
    this.server.off('NEW_GAME', this.onNewGame);
    this.server.off('ROUND_ENDED', this.onRoundEnded);
    this.server.off('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
    this.server.off('PLAYER_CONNECTED', this.onPlayerConnected);
    
    // Remove test command listener
    this.server.off('CHAT_COMMAND:!bmupdate', this.onBmUpdateCommand);
    
    // UpdateManager handles its own cleanup
    
    // Clear disconnect check interval
    if (this.disconnectCheckInterval) {
      clearInterval(this.disconnectCheckInterval);
    }
    
    // Clear disconnect timeouts
    for (const timeout of this.disconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.disconnectTimeouts.clear();
    this.orphanedSessions.clear();
    this.lastKnownPlayers.clear();
    
    this.verbose(1, `BMOverlayMonitor unmounted for ${this.options.serverIdentifier}`);
  }

  // Handle admin chat command
  async onChatCommand(info) {
    try {
      const adminCommandData = {
        type: 'admin_command',
        serverIdentifier: this.options.serverIdentifier,
        timestamp: Date.now(),
        admin: {
          name: info.player.name,
          steamID: info.player.steamID,
          eosID: info.player.eosID,
          teamID: info.player.teamID,
          squadID: info.player.squadID
        },
        command: 'admin',
        message: info.message || '',
        chat: info.chat
      };

      this.adminActivity.lastAdminCommand = adminCommandData;
      
      // Send to Cloudflare Worker immediately with retry
      await this.sendDataToWorkerWithRetry(adminCommandData);
      
      this.verbose(1, `Admin command captured: ${info.player.name} requested admin`);
      
    } catch (error) {
      this.verbose(1, 'Error handling admin command:', error.message);
    }
  }

  // Handle admin entering camera
  async onAdminCameraEnter(info) {
    try {
      // Safety check for player data
      if (!info.player || !info.player.eosID) {
        this.verbose(1, 'Admin camera enter event missing player data');
        return;
      }

      // Check if player should be ignored
      if (this.isPlayerIgnored(info.player)) {
        this.verbose(1, `Admin ${info.player.name} is in ignore list, skipping BM Overlay tracking`);
        return;
      }

      const cameraEnterData = {
        type: 'admin_camera_enter',
        serverIdentifier: this.options.serverIdentifier,
        timestamp: Date.now(),
        admin: {
          name: info.player.name || 'Unknown',
          steamID: info.player.steamID || 'Unknown',
          eosID: info.player.eosID,
          teamID: info.player.teamID || 0,
          squadID: info.player.squadID || 0
        },
        action: 'entered_admin_camera'
      };

      // Track admin in camera with enter time
      this.adminActivity.adminsInCamera.set(info.player.eosID, Date.now());
      
      // Send to Cloudflare Worker immediately with retry
      await this.sendDataToWorkerWithRetry(cameraEnterData);
      
      this.verbose(1, `Admin camera enter captured: ${info.player.name} entered admin camera`);
      
    } catch (error) {
      this.verbose(1, 'Error handling admin camera enter:', error.message);
    }
  }

  // Handle admin exiting camera
  async onAdminCameraExit(info) {
    try {
      // Safety check for player data
      if (!info.player || !info.player.eosID) {
        this.verbose(1, 'Admin camera exit event missing player data');
        return;
      }

      // Check if player should be ignored
      if (this.isPlayerIgnored(info.player)) {
        this.verbose(1, `Admin ${info.player.name} is in ignore list, skipping BM Overlay tracking`);
        return;
      }

      // Check if player was in admin camera
      const enterTime = this.adminActivity.adminsInCamera.get(info.player.eosID);
      if (!enterTime) {
        return;
      }

      const duration = info.duration || (Date.now() - enterTime);
      
      const cameraExitData = {
        type: 'admin_camera_exit',
        serverIdentifier: this.options.serverIdentifier,
        timestamp: Date.now(),
        admin: {
          name: info.player.name || 'Unknown',
          steamID: info.player.steamID || 'Unknown',
          eosID: info.player.eosID,
          teamID: info.player.teamID || 0,
          squadID: info.player.squadID || 0
        },
        action: 'exited_admin_camera',
        duration: duration
      };

      // Remove admin from camera tracking
      this.adminActivity.adminsInCamera.delete(info.player.eosID);
      
      // Clear any disconnect timeout for this player
      const timeout = this.disconnectTimeouts.get(info.player.eosID);
      if (timeout) {
        clearTimeout(timeout);
        this.disconnectTimeouts.delete(info.player.eosID);
      }
      
      // Remove from orphaned sessions if they were there
      this.orphanedSessions.delete(info.player.eosID);
      
      // Record camera session and maintain history limit
      this.adminActivity.cameraSessions.push({
        admin: info.player.name,
        duration: duration,
        timestamp: Date.now()
      });
      
      // Maintain session history limit to prevent memory leaks
      if (this.adminActivity.cameraSessions.length > this.options.maxCameraSessionsHistory) {
        this.adminActivity.cameraSessions = this.adminActivity.cameraSessions.slice(-this.options.maxCameraSessionsHistory);
      }
      
      // Send to Cloudflare Worker immediately with retry
      await this.sendDataToWorkerWithRetry(cameraExitData);
      
      this.verbose(1, `Admin camera exit captured: ${info.player.name} exited admin camera after ${Math.round(duration / 1000)}s`);
      
    } catch (error) {
      this.verbose(1, 'Error handling admin camera exit:', error.message);
    }
  }

  // Handle player disconnect
  async onPlayerDisconnected(info) {
    if (!info.player) return;

    const playerEosID = info.player.eosID;
    const isInCamera = this.adminActivity.adminsInCamera.has(playerEosID);

    if (isInCamera) {
      // Check if player should be ignored
      if (this.isPlayerIgnored(info.player)) {
        this.verbose(1, `Admin ${info.player.name} is in ignore list, skipping disconnect tracking`);
        return;
      }
      this.verbose(1, `Admin ${info.player.name} disconnected while in admin camera, setting cleanup timeout`);
      
      // Set a timeout to clean up the session if they don't reconnect
      const timeout = setTimeout(() => {
        this.cleanupOrphanedSession(playerEosID, info.player.name);
      }, this.options.disconnectTimeoutSeconds * 1000);

      this.disconnectTimeouts.set(playerEosID, timeout);
      this.orphanedSessions.set(playerEosID, {
        admin: info.player.name,
        steamID: info.player.steamID,
        eosID: playerEosID,
        startTime: this.adminActivity.adminsInCamera.get(playerEosID),
        disconnectTime: Date.now(),
        playerName: info.player.name
      });
      
      // Send disconnect notification to Cloudflare Worker
      const disconnectData = {
        type: 'admin_camera_disconnect',
        serverIdentifier: this.options.serverIdentifier,
        timestamp: Date.now(),
        admin: {
          name: info.player.name || 'Unknown',
          steamID: info.player.steamID || 'Unknown',
          eosID: playerEosID,
          teamID: info.player.teamID || 0,
          squadID: info.player.squadID || 0
        },
        action: 'disconnected_in_admin_camera',
        activeAdminsInCamera: this.adminActivity.adminsInCamera.size - 1 // Count after this disconnect
      };
      
      await this.sendDataToWorkerWithRetry(disconnectData);
    }
  }

  // Handle player connect
  async onPlayerConnected(info) {
    if (!info.player) return;

    const playerEosID = info.player.eosID;
    const timeout = this.disconnectTimeouts.get(playerEosID);
    const orphanedSession = this.orphanedSessions.get(playerEosID);

    // Add to last known players
    this.lastKnownPlayers.add(playerEosID);

    if (timeout) {
      // Clear the disconnect timeout since they reconnected
      clearTimeout(timeout);
      this.disconnectTimeouts.delete(playerEosID);
      this.verbose(1, `Admin ${info.player.name} reconnected, cleared disconnect timeout`);
    }

    if (orphanedSession) {
      // Remove from orphaned sessions since they reconnected
      this.orphanedSessions.delete(playerEosID);
      this.verbose(1, `Admin ${info.player.name} reconnected, restored from orphaned sessions`);
      
      // Send reconnection notification to Cloudflare Worker
      const reconnectData = {
        type: 'admin_camera_reconnect',
        serverIdentifier: this.options.serverIdentifier,
        timestamp: Date.now(),
        admin: {
          name: info.player.name || 'Unknown',
          steamID: info.player.steamID || 'Unknown',
          eosID: playerEosID,
          teamID: info.player.teamID || 0,
          squadID: info.player.squadID || 0
        },
        action: 'reconnected_after_disconnect',
        activeAdminsInCamera: this.adminActivity.adminsInCamera.size
      };
      
      await this.sendDataToWorkerWithRetry(reconnectData);
    }
  }

  // Set up periodic disconnect checking for Alt+F4 detection
  setupDisconnectChecking() {
    // Check for missing admins at configured interval
    this.disconnectCheckInterval = setInterval(() => {
      this.checkForMissingAdmins();
    }, this.options.disconnectCheckInterval);
    
    this.verbose(1, `🔍 Periodic disconnect checking enabled (every ${this.options.disconnectCheckInterval / 1000} seconds)`);
  }

  // Check for missing admins who may have Alt+F4'd
  checkForMissingAdmins() {
    try {
      const currentPlayerEosIDs = new Set();
      
      // Get current online players
      if (this.server.players) {
        for (const player of this.server.players) {
          if (player.eosID) {
            currentPlayerEosIDs.add(player.eosID);
          }
        }
      }
      
      // Check for admins in camera who are no longer online
      for (const [eosID, enterTime] of this.adminActivity.adminsInCamera) {
        if (!currentPlayerEosIDs.has(eosID)) {
          // This admin is no longer online but we still have them in camera tracking
          // Check if we already have a timeout for them
          if (!this.disconnectTimeouts.has(eosID)) {
            this.verbose(1, `🔍 Detected missing admin (EOS: ${eosID}) - likely Alt+F4 or crash`);
            
            // Find the player info from last known players or create a fallback
            let playerName = 'Unknown Admin';
            let steamID = 'Unknown';
            let teamID = 0;
            let squadID = 0;
            
            // Try to find player info from server data
            for (const player of this.server.players || []) {
              if (player.eosID === eosID) {
                playerName = player.name || 'Unknown Admin';
                steamID = player.steamID || 'Unknown';
                teamID = player.teamID || 0;
                squadID = player.squadID || 0;
                break;
              }
            }
            
            // Check if player should be ignored
            const playerInfo = { eosID, name: playerName, steamID, teamID, squadID };
            if (this.isPlayerIgnored(playerInfo)) {
              this.verbose(1, `Admin ${playerName} is in ignore list, skipping missing admin detection`);
              // Remove from camera tracking but don't send notifications
              this.adminActivity.adminsInCamera.delete(eosID);
              continue;
            }
            
            // Set up disconnect tracking
            const timeout = setTimeout(() => {
              this.cleanupOrphanedSession(eosID, playerName);
            }, this.options.disconnectTimeoutSeconds * 1000);

            this.disconnectTimeouts.set(eosID, timeout);
            this.orphanedSessions.set(eosID, {
              admin: playerName,
              steamID: steamID,
              eosID: eosID,
              startTime: enterTime,
              disconnectTime: Date.now(),
              playerName: playerName,
              detectedBy: 'periodic_check'
            });
            
            // Send immediate disconnect notification
            const disconnectData = {
              type: 'admin_camera_disconnect',
              serverIdentifier: this.options.serverIdentifier,
              timestamp: Date.now(),
              admin: {
                name: playerName,
                steamID: steamID,
                eosID: eosID,
                teamID: teamID,
                squadID: squadID
              },
              action: 'disconnected_in_admin_camera',
              detectedBy: 'periodic_check',
              activeAdminsInCamera: this.adminActivity.adminsInCamera.size - 1
            };
            
            this.sendDataToWorkerWithRetry(disconnectData);
          }
        }
      }
      
      // Update last known players
      this.lastKnownPlayers = currentPlayerEosIDs;
      
    } catch (error) {
      this.verbose(1, 'Error in periodic disconnect check:', error.message);
    }
  }

  // Clean up orphaned session after timeout
  cleanupOrphanedSession(eosID, playerName) {
    const orphanedSession = this.orphanedSessions.get(eosID);
    if (!orphanedSession) return;

    const currentTime = Date.now();
    const sessionDuration = currentTime - orphanedSession.startTime;
    
    // Remove from active camera tracking
    this.adminActivity.adminsInCamera.delete(eosID);
    
    // Clear timeout and orphaned session
    this.disconnectTimeouts.delete(eosID);
    this.orphanedSessions.delete(eosID);
    
    // Record orphaned session
    this.adminActivity.cameraSessions.push({
      admin: playerName,
      duration: sessionDuration,
      timestamp: currentTime,
      orphaned: true,
      orphanReason: orphanedSession.detectedBy || 'disconnect'
    });
    
    // Maintain session history limit
    if (this.adminActivity.cameraSessions.length > this.options.maxCameraSessionsHistory) {
      this.adminActivity.cameraSessions = this.adminActivity.cameraSessions.slice(-this.options.maxCameraSessionsHistory);
    }
    
    // Send cleanup notification to Cloudflare Worker
    const cleanupData = {
      type: 'admin_camera_cleanup',
      serverIdentifier: this.options.serverIdentifier,
      timestamp: currentTime,
      admin: {
        name: playerName,
        steamID: orphanedSession.steamID || 'Unknown',
        eosID: eosID,
        teamID: 0,
        squadID: 0
      },
      action: 'session_cleaned_up_after_disconnect',
      sessionDuration: sessionDuration,
      detectedBy: orphanedSession.detectedBy || 'event',
      activeAdminsInCamera: this.adminActivity.adminsInCamera.size
    };
    
    this.sendDataToWorkerWithRetry(cleanupData);
    
    const detectionMethod = orphanedSession.detectedBy || 'event';
    this.verbose(1, `Cleaned up orphaned session for ${playerName} after ${Math.round(sessionDuration / 1000)}s (${detectionMethod})`);
  }

  // Handle new game start
  async onNewGame(info) {
    try {
      this.currentGameState = {
        status: 'active',
        startTime: Date.now(),
        endTime: null,
        layer: info.layer?.name || 'Unknown',
        roundNumber: this.currentGameState.roundNumber + 1
      };

      // Clear disconnect tracking for new game
      for (const timeout of this.disconnectTimeouts.values()) {
        clearTimeout(timeout);
      }
      this.disconnectTimeouts.clear();
      this.orphanedSessions.clear();
      this.lastKnownPlayers.clear();

      const newGameData = {
        type: 'new_game',
        serverIdentifier: this.options.serverIdentifier,
        timestamp: Date.now(),
        gameState: this.currentGameState,
        layer: {
          name: info.layer?.name || 'Unknown',
          classname: info.layer?.classname || 'Unknown',
          id: info.layer?.layerid || 'Unknown'
        },
        serverInfo: {
          playerCount: this.server.players?.length || 0,
          maxPlayers: this.server.maxPlayers || 0,
          serverName: this.server.serverName || 'Unknown'
        }
      };

      // Send to Cloudflare Worker immediately with retry
      await this.sendDataToWorkerWithRetry(newGameData);
      
      this.verbose(1, `New game captured: ${info.layer?.name || 'Unknown'} started`);
      
    } catch (error) {
      this.verbose(1, 'Error handling new game:', error.message);
    }
  }

  // Handle round end
  async onRoundEnded(info) {
    try {
      this.currentGameState.status = 'ended';
      this.currentGameState.endTime = Date.now();

      const roundEndData = {
        type: 'round_ended',
        serverIdentifier: this.options.serverIdentifier,
        timestamp: Date.now(),
        gameState: this.currentGameState,
        roundDuration: this.currentGameState.endTime - this.currentGameState.startTime,
        serverInfo: {
          playerCount: this.server.players?.length || 0,
          maxPlayers: this.server.maxPlayers || 0,
          serverName: this.server.serverName || 'Unknown'
        }
      };

      // Send to Cloudflare Worker immediately with retry
      await this.sendDataToWorkerWithRetry(roundEndData);
      
      this.verbose(1, `Round ended captured: ${this.currentGameState.layer} ended after ${Math.round((this.currentGameState.endTime - this.currentGameState.startTime) / 1000)}s`);
      
    } catch (error) {
      this.verbose(1, 'Error handling round end:', error.message);
    }
  }

  // Setup periodic data transfer
  setupDataTransfer() {
    // Send current state periodically
    this.updateInterval = setInterval(async () => {
      try {
        await this.sendCurrentState();
      } catch (error) {
        this.verbose(1, 'Error in periodic state update:', error.message);
      }
    }, this.options.updateInterval);
  }

  // Send current state to Worker
  async sendCurrentState() {
    try {
      const currentStateData = {
        type: 'current_state',
        serverIdentifier: this.options.serverIdentifier,
        timestamp: Date.now(),
        gameState: this.currentGameState,
        adminActivity: {
          lastAdminCommand: this.adminActivity.lastAdminCommand,
          adminsInCamera: Array.from(this.adminActivity.adminsInCamera.keys()),
          cameraSessions: this.adminActivity.cameraSessions.slice(-10), // Last 10 sessions
          disconnectTracking: {
            activeTimeouts: this.disconnectTimeouts.size,
            orphanedSessions: this.orphanedSessions.size
          }
        },
        serverInfo: {
          playerCount: this.server.players?.length || 0,
          maxPlayers: this.server.maxPlayers || 0,
          serverName: this.server.serverName || 'Unknown',
          currentLayer: this.server.currentLayer?.name || 'Unknown',
          nextLayer: this.server.nextLayer?.name || 'Unknown'
        }
      };

      await this.sendDataToWorkerWithRetry(currentStateData);
      
    } catch (error) {
      this.verbose(1, 'Error sending current state:', error.message);
    }
  }

  // Send data to Cloudflare Worker with retry logic
  async sendDataToWorkerWithRetry(data, attempt = 1) {
    try {
      const response = await axios.post(`${this.options.cloudflareWorkerUrl}/api/update`, data, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.options.workerApiKey,
          'User-Agent': `SquadJS-BMOverlayMonitor/${this.options.serverIdentifier}`
        },
        timeout: 5000 // 5 second timeout
      });

      if (response.status >= 200 && response.status < 300) {
        this.verbose(2, `Data sent to Worker successfully: ${data.type}`);
        return true;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.verbose(1, `Error sending data to Worker (attempt ${attempt}):`, error.message);
      
      // Retry logic
      if (attempt < this.options.retryAttempts) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        this.verbose(1, `Retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendDataToWorkerWithRetry(data, attempt + 1);
      } else {
        this.verbose(1, `Failed to send data after ${this.options.retryAttempts} attempts`);
        return false;
      }
    }
  }

  // Test command for UpdateManager functionality
  async onBmUpdateCommand(info) {
    const player = this.server.getPlayerByEOSID(info.player.eosID);
    if (!player || !this.server.isAdmin(player.steamID)) {
      await this.server.rcon.warn(info.player.eosID, 'You need admin permissions to use this command.');
      return;
    }

    try {
      await this.server.rcon.warn(info.player.eosID, '🔄 Manually checking for updates...');
      
      // Check for updates using UpdateManager
      await UpdateManager.checkPluginUpdates('BM-OverlayMonitor');
      
      // Get update status
      const status = UpdateManager.getUpdateStatus();
      const pluginInfo = UpdateManager.getPluginInfo('BM-OverlayMonitor');
      
      if (pluginInfo && pluginInfo.needsUpdate) {
        await this.server.rcon.warn(info.player.eosID, `🔄 Update available: ${pluginInfo.version} → ${pluginInfo.latestVersion}`);
        await this.server.rcon.warn(info.player.eosID, '🔄 Update will be applied automatically by UpdateManager');
      } else if (pluginInfo && pluginInfo.error) {
        await this.server.rcon.warn(info.player.eosID, `⚠️ Update check failed: ${pluginInfo.error}`);
      } else {
        await this.server.rcon.warn(info.player.eosID, `✅ Plugin is up to date (${pluginInfo?.version || PLUGIN_VERSION})`);
      }
      
      // Show overall update status
      await this.server.rcon.warn(info.player.eosID, `📊 Total plugins checked: ${status.totalChecked}, Updates available: ${status.updatesAvailable}`);
      
    } catch (error) {
      await this.server.rcon.warn(info.player.eosID, `❌ Update check error: ${error.message}`);
    }
  }
}
