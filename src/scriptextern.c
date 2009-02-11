/*
	This file is part of Warzone 2100.
	Copyright (C) 1999-2004  Eidos Interactive
	Copyright (C) 2005-2009  Warzone Resurrection Project

	Warzone 2100 is free software; you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation; either version 2 of the License, or
	(at your option) any later version.

	Warzone 2100 is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with Warzone 2100; if not, write to the Free Software
	Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA 02110-1301 USA
*/
/*
 * ScriptExtern.c
 *
 * All game variable access functions for the scripts
 *
 */

#include "lib/framework/frame.h"
#include "map.h"

#include "lib/script/script.h"
#include "scripttabs.h"
#include "scriptextern.h"

#include "display.h"

#include "multiplay.h"

#include "main.h"
#include "hci.h"
#include "lib/gamelib/gtime.h"


// current game level
SDWORD		scrGameLevel = 0;

// whether the tutorial is active
BOOL		bInTutorial = false;

// whether any additional special case victory/failure conditions have been met
BOOL		bExtraVictoryFlag = false;
BOOL		bExtraFailFlag = false;



// whether or not to track the player's transporter as it comes
// into an offworld mission.
BOOL		bTrackTransporter = false;


// reset the script externals for a new level
void scrExternReset(void)
{
	scrGameLevel = 0;
	bInTutorial = false;
	bExtraVictoryFlag = false;
	bExtraFailFlag = false;
}

int scrGetCVar(lua_State *L)
{
	int id = luaL_checkinteger(L, 1);
	switch (id)
	{
		case EXTID_TRACKTRANSPORTER:
			lua_pushboolean(L, bTrackTransporter);
			break;
		case EXTID_MAPWIDTH:
			lua_pushinteger(L, mapWidth);
			break;
		case EXTID_MAPHEIGHT:
			lua_pushinteger(L, mapHeight);
			break;
		case EXTID_GAMEINIT:
			lua_pushboolean(L, gameInitialised);
			break;
		case EXTID_SELECTEDPLAYER:
			lua_pushinteger(L, selectedPlayer);
			break;
		case EXTID_GAMETIME:
			lua_pushinteger(L, (SDWORD)(gameTime/SCR_TICKRATE));
			break;
		case EXTID_GAMELEVEL:
			lua_pushinteger(L, scrGameLevel);
			break;
		case EXTID_TUTORIAL:
			lua_pushboolean(L, bInTutorial);
			break;
		case EXTID_CURSOR:
			lua_pushinteger(L, 0); // FIXME Set to 0 since function returned undef value
			break;
		case EXTID_INTMODE:
			lua_pushinteger(L, intMode);
			break;
		case EXTID_TARGETTYPE:
			lua_pushinteger(L, getTargetType());
			break;
		case EXTID_EXTRAVICTORYFLAG:
			lua_pushboolean(L, bExtraVictoryFlag);
			break;
		case EXTID_EXTRAFAILFLAG:
			lua_pushboolean(L, bExtraFailFlag);
			break;
		case EXTID_MULTIGAMETYPE:
			lua_pushinteger(L, game.type);
			break;
		case EXTID_MULTIGAMEHUMANMAX:
			lua_pushinteger(L, game.maxPlayers);
			break;
		case EXTID_MULTIGAMEBASETYPE:
			lua_pushinteger(L, game.base);
			break;
		case EXTID_MULTIGAMEALLIANCESTYPE:
			lua_pushinteger(L, game.alliance);
			break;
		default:
			luaL_error(L, "invalid id %d for C variable");
	}
	return 1;
}

int scrSetCVar(lua_State *L)
{
	int id = luaL_checkinteger(L, 1);
	int value;
	switch (id)
	{
		case EXTID_TRACKTRANSPORTER:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_MAPWIDTH:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_MAPHEIGHT:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_GAMEINIT:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_SELECTEDPLAYER:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_GAMETIME:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_GAMELEVEL:
			value = luaL_checkinteger(L, 2);
			scrGameLevel = value;
			break;
		case EXTID_TUTORIAL:
			value = luaL_checkboolean(L, 2);
			bInTutorial = value;
			break;
		case EXTID_CURSOR:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_INTMODE:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_TARGETTYPE:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_EXTRAVICTORYFLAG:
			value = luaL_checkboolean(L, 2);
			bExtraVictoryFlag = value;
			break;
		case EXTID_EXTRAFAILFLAG:
			value = luaL_checkboolean(L, 2);
			bExtraFailFlag = value;
			break;
		case EXTID_MULTIGAMETYPE:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_MULTIGAMEHUMANMAX:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_MULTIGAMEBASETYPE:
			luaL_error(L, "readonly C variable");
			break;
		case EXTID_MULTIGAMEALLIANCESTYPE:
			luaL_error(L, "readonly C variable");
			break;
		default:
			luaL_error(L, "invalid id %d for C variable");
	}
	return 0;
}
