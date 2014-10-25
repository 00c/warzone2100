
//;; \section{libcampaign.js documentation}
//;;
//;; \texttt{libcampaign.js} is a JavaScript library supplied with the game,
//;; which contains reusable code for campaign scenarios. It is designed to
//;; make scenario development as high-level and declarative as possible.
//;; It also contains a few simple convenient wrappers.
//;; Public API functions of \texttt{libcampaign.js} are prefixed with
//;; `\texttt{cam}'. To use \texttt{libcampaign.js}, add the following include
//;; into your scenario code:
//;;
//;; \begin{lstlisting}
//;; include("script/campaign/libcampaign.js");
//;; \end{lstlisting}
//;;
//;; Also, most of the \texttt{libcampaign.js} features require some of the
//;; game events handled by the library. Transparent JavaScript pre-hooks are
//;; therefore injected into your global event handlers upon include. For
//;; example, if \texttt{camSetArtifacts()} was called to let
//;; \texttt{libcampaign.js} manage scenario artifacts, then
//;; \texttt{eventPickup()} will be first handled by the library, and only then
//;; your handler will be called, if any.
//;; All of this happens automagically and does not normally require
//;; your attention.

/*
	Private vars and functions are prefixed with `__cam'.
	Please do not use private stuff in scenario code, use only public API.

	We CANNOT put our private vars into an anonymous namespace, even though
	it's a common JS trick -

		(function(global) {
			var __camPrivateVar; // something like that
		})(this);

	because they would break on savegame-loadgame. So let's just agree
	that we'd never use them anywhere outside the file, so that it'd be easier
	to change them, and also think twice before we change the public API.

	The lib is split into sections, each section is separated with a slash line:

////////////////////////////////////////////////////////////////////////////////
// Section name.
////////////////////////////////////////////////////////////////////////////////

	yeah, like that. Also, it's exactly 80 characters wide. Code shouldn't be
	wider than that.

	In each section, public stuff is on TOP, and private stuff
	is below, split from the public stuff with:

//////////// privates

	, for easier reading (all the useful stuff on top).

	Please leave camDebug() around iff something that should never happen
	occurs, indicating an actual bug in campaign. Then a sensible message
	should be helpful as well. But normally, no warnings should ever be
	printed.

	In cheat mode, more warnings make sense, explaining what's going on
	under the hood. Use camTrace() for such warnings - they'd auto-hide
	outside cheat mode.

	Lines prefixed with // followed by ;; are docstrings for JavaScript API
	documentation. Visit
		http://buildbot.wz2100.net/files/javascript/javascript.html
	to see how it looks. The documentation is coded in TeX; but please
	use only very simple TeX, because it would then be compiled to
	HTML by HeVeA, which fails to support most of the complicated stuff.
*/


////////////////////////////////////////////////////////////////////////////////
// Misc useful stuff.
////////////////////////////////////////////////////////////////////////////////


const CAM_HUMAN_PLAYER = 0;
const CAM_MAX_PLAYERS = 8;

//;; \subsection{camDef(something)}
//;; Returns false if something is JavaScript-undefined, true otherwise.
function camDef(something)
{
	return typeof(something) !== "undefined";
}

//;; \subsection{camIsString(something)}
//;; Returns true if something is a string, false otherwise.
function camIsString(something)
{
	return typeof(something) === "string";
}

//;; \subsection{camRand(max)}
//;; A non-synchronous random integer in range [0, max - 1].
function camRand(max)
{
	if (max > 0)
		return Math.floor(Math.random() * max);
}

//;; \subsection{camSafeRemoveObject(obj[, special effects?])}
//;; Remove a game object (by value or label) if it exists, do nothing otherwise.
function camSafeRemoveObject(obj, flashy)
{
	if (camIsString(obj))
		obj = getObject(obj);
	if (camDef(obj) && obj)
		removeObject(obj, flashy);
}

//;; \subsection{camMakePos(x, y | label | object)}
//;; Make a POSITION-like object, unless already done. Often useful
//;; for making functions that would accept positions in both xx,yy and {x:xx,y:yy} forms.
//;; Also accepts labels. If label of AREA is given, returns a random spot in the area.
//;; If an existing object or label of such is given, returns a safe JavaScript
//;; object containing its x, y and id.
function camMakePos(xx, yy)
{
	if (camDef(yy))
		return { x : xx, y : yy };
	if (!camDef(xx))
		return undefined;
	var obj = xx;
	if (camIsString(xx))
		obj = getObject(xx);
	if (!camDef(obj) || !obj)
	{
		camDebug("Failed at", xx);
		return undefined;
	}
	switch (obj.type)
	{
		case DROID:
		case STRUCTURE:
		case FEATURE:
			// store ID for those as well.
			return { x: obj.x, y: obj.y, id: obj.id };
		case POSITION:
			return obj;
		case AREA:
			return {
				x: obj.x + camRand(obj.x2 - obj.x + 1),
				y: obj.y + camRand(obj.y2 - obj.y + 1)
			};
		case GROUP:
		default:
			camDebug("Not implemented:", obj.type);
			return undefined;
	}
}

//;; \subsection{camDist(x1, y1, x2, y2 | pos1, x2, y2 | x1, y1, pos2 | pos1, pos2)}
//;; A wrapper for distBetweenTwoPoints.
function camDist(x1, y1, x2, y2)
{
	if (camDef(y2)) // standard
		return distBetweenTwoPoints(x1, y1, x2, y2);
	var pos2 = camMakePos(x2, y2);
	if (!camDef(pos2)) // pos1, pos2
		return distBetweenTwoPoints(x1.x, x1.y, y1.x, y1.y);
	if (camDef(pos2.x)) // x2 is pos2
		return distBetweenTwoPoints(x1, y1, pos2.x, pos2.y);
	else // pos1, x2, y2
		return distBetweenTwoPoints(x1.x, x1.y, y1, x2);
}

//;; \subsection{camPlayerMatchesFilter(player, filter)}
//;; A function to handle player filters in a way similar to
//;; how JS API functions (eg. \texttt{enumDroid(filter, ...)}) handle them.
function camPlayerMatchesFilter(player, filter)
{
	switch(filter) {
		case ALL_PLAYERS:
			return true;
		case ALLIES:
			return player === CAM_HUMAN_PLAYER;
		case ENEMIES:
			return player >= 0 && player < CAM_MAX_PLAYERS
			                   && player !== CAM_HUMAN_PLAYER;
		default:
			return player === filter;
	}
}

//;; \subsection{camMakeGroup(what, filter)}
//;; Make a new group out of array of droids, single game object,
//;; or label string, with fuzzy auto-detection of argument type.
//;; Only droids would be added to the group. \textbf{filter} can be one of
//;; a player index, ALL_PLAYERS, ALLIES or ENEMIES. 
function camMakeGroup(what, filter)
{
	if (!camDef(filter))
		filter = ALL_PLAYERS;
	var array;
	var obj;
	if (camIsString(what)) // label
		obj = getObject(what);
	else if (camDef(what.length)) // array
		array = what;
	else if (camDef(what.type)) // object
		obj = what;
	if (camDef(obj))
	{
		switch(obj.type) {
			case POSITION:
				obj = getObject(obj.x, obj.y);
				// fall-through
			case DROID:
			case STRUCTURE:
			case FEATURE:
				array = [ obj ];
				break;
			case AREA:
				array = enumArea(obj.x, obj.y, obj.x2, obj.y2,
				                 ALL_PLAYERS, false);
				break;
			case GROUP:
				array = enumGroup(obj.id);
				break;
			default:
				camDebug("Unknown object type", obj.type);
		}
	}
	if (camDef(array))
	{
		var group = newGroup()
		for (var i = 0; i < array.length; ++i)
		{
			var obj = array[i];
			if (!camDef(obj) || !obj)
			{
				camDebug("Trying to add", obj);
				continue;
			}
			if (obj.type === DROID && camPlayerMatchesFilter(obj.player, filter))
				groupAdd(group, array[i]);
		}
		return group;
	}
	camDebug("Cannot parse", what);
}

//////////// privates

var __camGlobalContext = this;


////////////////////////////////////////////////////////////////////////////////
// Debugging helpers.
////////////////////////////////////////////////////////////////////////////////


//;; \subsection{camMarkTiles(label | array of labels)}
//;; Mark area on the map by label(s), but only if debug mode is enabled.
//;; Otherwise, remember what to mark in case it is going to be.
function camMarkTiles(label)
{
	if (camIsString(label))
		__camMarkedTiles[label] = true;
	else
		for (var i = 0; i < label.length; ++i)
			__camMarkedTiles[label[i]] = true;
	// apply instantly
	__camUpdateMarkedTiles();
}

//;; \subsection{camUnmarkTiles(label | array of labels)}
//;; No longer mark area(s) with given label(s) in debug mode.
function camUnmarkTiles(label)
{
	if (camIsString(label))
		delete __camMarkedTiles[label];
	else
		for (var i = 0; i < label.length; ++i)
			delete __camMarkedTiles[label[i]];
	// apply instantly
	__camUpdateMarkedTiles();
}

//;; \subsection{camDebug(string...)}
//;; Pretty debug prints - a wrapper around \texttt{debug()}.
//;; Prints a function call stack and the argument message,
//;; prefixed with "DEBUG". Only use this function to indicate
//;; actual bugs in the scenario script, because game shouldn't
//;; print things when nothing is broken. If you want to keep
//;; some prints around to make debugging easier without distracting
//;; the user, use \texttt{camTrace()}.
function camDebug()
{
	__camGenericDebug("DEBUG",
	                  arguments.callee.caller.name,
	                  arguments,
	                  true,
	                  __camBacktrace());
}

//;; \subsection{camDebugOnce(string...)}
//;; Same as \texttt{camDebug()}, but prints each message only once
//;; during script lifetime.
function camDebugOnce()
{
	var str = arguments.callee.caller.name
		+ ": " + Array.prototype.join.call(arguments, " ");
	if (camDef(__camDebuggedOnce[str]))
		return;
	__camDebuggedOnce[str] = true;
	__camGenericDebug("DEBUG",
	                  arguments.callee.caller.name,
	                  arguments,
	                  true,
	                  __camBacktrace());
}

//;; \subsection{camTrace(string...)}
//;; Same as \texttt{camDebug()}, but only warns in cheat mode.
//;; Prefixed with "TRACE". It's safe and natural to keep \texttt{camTrace()}
//;; calls in your code for easier debugging.
function camTrace()
{
	if (!__camCheatMode)
		return;
	__camGenericDebug("TRACE",
	                  arguments.callee.caller.name,
	                  arguments);
}

//;; \subsection{camTraceOnce(string...)}
//;; Same as \texttt{camTrace()}, but prints each message only once
//;; during script lifetime.
function camTraceOnce()
{
	if (!__camCheatMode)
		return;
	var str = arguments.callee.caller.name
		+ ": " + Array.prototype.join.call(arguments, " ");
	if (camDef(__camTracedOnce[str]))
		return;
	__camTracedOnce[str] = true;
	__camGenericDebug("TRACE",
	                  arguments.callee.caller.name,
	                  arguments);
}


//////////// privates

var __camMarkedTiles = {};
var __camCheatMode = false;
var __camDebuggedOnce = {};
var __camTracedOnce = {};

function __camUpdateMarkedTiles()
{
	hackMarkTiles();
	if (__camCheatMode && camDef(__camMarkedTiles))
		for (var label in __camMarkedTiles)
			hackMarkTiles(label);
}

function __camLetMeWin()
{
	__camLetMeWinArtifacts();
	__camGameWon();
}

function __camWinInfo()
{
	chat(CAM_HUMAN_PLAYER, "Picked up " + __camNumArtifacts
		+ " artifacts out of " + Object.keys(__camArtifacts).length);
	chat(CAM_HUMAN_PLAYER, "Eliminated " + __camNumEnemyBases
		+ " enemy bases out of " + Object.keys(__camEnemyBases).length);
}

function __camGenericDebug(flag, func, args, err, bt)
{
	if (camDef(bt) && bt)
		for (var i = bt.length - 1; i >= 0; --i)
			debug("STACK: from", [bt[i]]);
	if (!func)
		func = "<anonymous>";
	var str = flag + ": " + func + ": " +
	      Array.prototype.join.call(args, " ");
	debug(str);
	if (camDef(err) && err)
		dump(str);
}

function __camBacktrace()
{
	var func = arguments.callee.caller;
	var list = [];
	while (camDef(func) && func)
	{
		if (func.name)
			list[list.length] = func.name;
		else
			list[list.length] = "<anonymous>";
		func = func.caller;
	}
	return list;
}

////////////////////////////////////////////////////////////////////////////////
// Artifacts management.
////////////////////////////////////////////////////////////////////////////////


//;; \subsection{camSetArtifacts(artifacts)}
//;; Tell \texttt{libcampaign.js} to manage a certain set of artifacts.
//;; The argument is a JavaScript map from object labels to artifact
//;; description. If the label points to a game object, artifact will be
//;; placed when this object is destroyed; if the label is a position, the
//;; artifact will be placed instantly. Artifact description is a JavaScript
//;; object with the following fields:
//;; \begin{description}
//;; 	\item[tech] The technology to grant when the artifact is recovered.
//;; \end{description}
//;; On \textbf{let me win} cheat, all technologies stored in the artifacts
//;; managed by this function are automatically granted.
function camSetArtifacts(artifacts)
{
	__camArtifacts = artifacts;
	__camNumArtifacts = 0;
	for (var alabel in __camArtifacts)
	{
		var ai = __camArtifacts[alabel];
		var pos = camMakePos(alabel);
		if (camDef(pos.id))
		{
			// will place when object with this id is destroyed
			ai.id = "" + pos.id;
			ai.placed = false;
		}
		else
		{
			// received position or area, place immediately
			var acrate = addFeature("Crate", pos.x, pos.y);
			var alabel = __camGetArtifactLabel(alabel);
			addLabel(acrate, alabel);
			ai.placed = true;
		}
	}
}

//;; \subsection{camAllArtifactsPickedUp()}
//;; Returns true if all artifacts managed by \texttt{libcampaign.js}
//;; were picked up.
function camAllArtifactsPickedUp()
{
	// FIXME: O(n) lookup here
	return __camNumArtifacts === Object.keys(__camArtifacts).length;
}

//////////// privates

var __camArtifacts;
var __camNumArtifacts;

function __camGetArtifactLabel(alabel)
{
	return alabel + "_artifact_label";
}

function __camGetArtifactKey(objlabel)
{
	return objlabel.replace("_artifact_label", "");
}

// called from eventDestroyed
function __camCheckPlaceArtifact(obj)
{
	// FIXME: O(n) lookup here
	var alabel = getLabel(obj);
	if (!camDef(alabel) || !alabel)
		return;
	var ai = __camArtifacts[alabel];
	if (!camDef(ai))
		return;
	if (ai.placed)
	{
		camDebug("Object to which artifact", alabel,
			"is bound has died twice");
		return;
	}
	camTrace("Placing", ai.tech);
	var acrate = addFeature("Crate", obj.x, obj.y);
	var alabel = __camGetArtifactLabel(alabel);
	addLabel(acrate, alabel);
	ai.placed = true;
}

function __camPickupArtifact(artifact)
{
	if (artifact.stattype !== ARTIFACT)
	{
		camDebug("Not an artifact");
		return;
	}
	// FIXME: O(n) lookup here
	var alabel = __camGetArtifactKey(getLabel(artifact));
	var ai = __camArtifacts[alabel];
	if (!camDef(alabel) || !alabel || !camDef(ai))
	{
		camTrace("Artifact", artifact.id, "is not managed");
		return;
	}

	camTrace("Picked up", ai.tech);
	playSound("pcv352.ogg", artifact.x, artifact.y, artifact.z);
	// artifacts are not self-removing...
	camSafeRemoveObject(artifact);
	enableResearch(ai.tech);
	++__camNumArtifacts;
}

function __camLetMeWinArtifacts()
{
	for (var alabel in __camArtifacts)
	{
		var ai = __camArtifacts[alabel];
		if (ai.placed)
		{
			var label = __camGetArtifactLabel(alabel);
			var artifact = getObject(label);
			if (!camDef(artifact))
				continue;
			__camPickupArtifact(artifact);
		}
		else
		{
			enableResearch(ai.tech);
		}
	}
}

////////////////////////////////////////////////////////////////////////////////
// Enemy base management.
////////////////////////////////////////////////////////////////////////////////

//;; \subsection{camSetEnemyBases(bases)}
//;; Tell \texttt{libcampaign.js} to manage a certain set of enemy bases.
//;; Management assumes auto-cleanup of leftovers on destruction, and also
//;; counting how many bases have been successfully destroyed by the player.
//;; The argument is a JavaScript map from group labels to base descriptions.
//;; Each label points to a group of vital base structures. If no group label
//;; with this name is defined, a group is created automatically
//;; based on \textbf{cleanup} area and labeled. Base description
//;; is a JavaScript object with the following optional fields:
//;; \begin{description}
//;; 	\item[cleanup] An area label to clean up features in once base is
//;; 	destroyed. If base id is not a group label, this field is required
//;; 	in order to auto-create the group of stuff in the area which doesn't
//;; 	qualify as a valid leftover.
//;; 	\item[detectSnd] A sound file to play when the base is detected.
//;; 	\item[eliminateSnd] A sound file to play when the base is eliminated.
//;; 	The sound is played in the center of the cleanup area,
//;; 	which needs to be defined.
//;; \end{description}
//;; Additionally, this function would call special event callbacks if they are
//;; defined in your script, which should be named as follows,
//;; where LABEL is the label of the base group:
//;; \begin{description}
//;; 	\item[camEnemyBaseDetected_LABEL] Called when the player sees an object from
//;; 	the enemy base group for the first time.
//;; 	\item[camEnemyBaseEliminated_LABEL] Called when the base is eliminated,
//;; 	right after leftovers were cleaned up.
//;; \end{description}
function camSetEnemyBases(bases)
{
	__camEnemyBases = bases;
	__camNumEnemyBases = 0;
	// convert label strings to groups and store
	for (var blabel in __camEnemyBases)
	{
		var bi = __camEnemyBases[blabel];
		var obj = getObject(blabel);
		if (camDef(obj) && obj) // group already defined
		{
			bi.group = obj.id;
		}
		else // define a group automatically
		{
			if (!camDef(bi.cleanup))
			{
				camDebug("Neither group nor cleanup area found for", blabel);
				continue;
			}
			bi.group = newGroup();
			addLabel({
				type: GROUP,
				id: bi.group,
				player: 0,
			}, blabel);
			var structs = enumArea(bi.cleanup, ENEMIES, false);
			for (var i = 0; i < structs.length; ++i)
			{
				var s = structs[i];
				if (s.type !== STRUCTURE || __camIsValidLeftover(s))
					continue;
				camTrace("Auto-adding" + s.id + "to base" + blabel);
				groupAdd(bi.group, s);
			}
		}
		bi.seen = false;
	}
}

//;; \subsection{camAllEnemyBasesEliminated()}
//;; Returns true if all enemy bases managed by \texttt{libcampaign.js}
//;; are destroyed.
function camAllEnemyBasesEliminated()
{
	// FIXME: O(n) lookup here
	return __camNumEnemyBases === Object.keys(__camEnemyBases).length;
}

//////////// privates

var __camEnemyBases;
var __camNumEnemyBases;

function __camCheckBaseSeen(seen)
{
	var group = seen.group;
	if (!camDef(group) || !group)
		return;
	// FIXME: O(n) lookup here
	for (var blabel in __camEnemyBases)
	{
		var bi = __camEnemyBases[blabel];
		if (bi.group !== group)
			continue;
		if (bi.seen)
			break;
		camTrace("Enemy base", blabel, "detected");
		bi.seen = true;
		if (camDef(bi.detectSnd) && camDef(seen))
			playSound(bi.detectSnd, seen.x, seen.y, 0);
		var callback = __camGlobalContext["camEnemyBaseDetected_" + blabel];
		if (camDef(callback))
			callback();
	}
}

function __camIsValidLeftover(obj)
{
	if (camPlayerMatchesFilter(obj.player, ENEMIES))
		if (obj.type === STRUCTURE && obj.stattype === WALL)
			return true;
	if (obj.type === FEATURE)
		if (obj.stattype === BUILDING)
			return true;
	return false;
}

function __camCheckBaseEliminated(group)
{
	// FIXME: O(n) lookup here
	for (var blabel in __camEnemyBases)
	{
		var bi = __camEnemyBases[blabel];
		if (bi.group !== group)
			continue;
		camTrace("Enemy base", blabel, "eliminated");
		if (camDef(bi.cleanup))
		{
			var leftovers = enumArea(bi.cleanup);
			for (var i = 0; i < leftovers.length; i++)
			{
				obj = leftovers[i];
				if (__camIsValidLeftover(obj))
				{
					// remove with special effect
					camSafeRemoveObject(obj, true);
				}
			}
			if (camDef(bi.eliminateSnd))
			{
				// play sound
				var pos = camMakePos(bi.cleanup);
				playSound(bi.eliminateSnd, pos.x, pos.y, 0);
			}
		}
		var callback = __camGlobalContext["camEnemyBaseEliminated_" + blabel];
		if (camDef(callback))
			callback();
		++__camNumEnemyBases;
		break;
	}
}


////////////////////////////////////////////////////////////////////////////////
// AI droid movement automation.
////////////////////////////////////////////////////////////////////////////////


const CAM_ORDER_ATTACK = 0;
const CAM_ORDER_DEFEND = 1;
const CAM_ORDER_PATROL = 2;

//;; \subsection{camManageGroup(group, order, data)}
//;; Tell \texttt{libcampaign.js} to manage a certain group. The group
//;; would be permanently managed depending on the high-level orders given.
//;; For each order, data parameter is a JavaScript object that controls
//;; different aspects of behavior. The order parameter is one of:
//;; \begin{description}
//;; 	\item[CAM_ORDER_ATTACK] Pursue human player, preferably around
//;; 	the given position. The following optional data object fields are
//;; 	available, none of which is required:
//;; 	\begin{description}
//;; 		\item[pos] Position to attack.
//;; 		\item[fallback] Position to retreat.
//;; 		\item[morale] An integer from 1 to 100. If that high percentage
//;; 		of the original group dies, fall back to the fallback position.
//;; 		If new droids are added to the group, it can recover and attack
//;; 		again.
//;; 		\item[count] Override size of the original group. If unspecified,
//;; 		number of doids in the group at call time. Retreat on low morale
//;; 		is counted against this value.
//;; 	\end{description}
//;; 	\item[CAM_ORDER_DEFEND] Protect the given position. If too far, retreat
//;; 	back there ignoring fire. The following data object fields are
//;; 	required:
//;; 	\begin{description}
//;; 		\item[pos] Position to defend.
//;; 	\end{description}
//;; 	\item[CAM_ORDER_PATROL] Move droids randomly between a given list of
//;; 	positions. The following data object fields are required:
//;; 	\begin{description}
//;; 		\item[pos] An array of positions to patrol between.
//;; 		\item[interval] Change positions every this many milliseconds.
//;; 	\end{description}
//;; \end{description} 
function camManageGroup(group, order, data)
{
	if (camDef(__camGroupInfo[group])
	    && order !== __camGroupInfo[group].order)
	{
		camTrace("Group", group, "receives a new order:",
		         camOrderToString(order));
	}
	__camGroupInfo[group] = {
		target: undefined,
		order: order,
		data: data,
		count: camDef(data.count) ? data.count : groupSize(group)
	};
	// apply orders instantly
	__camTacticsTick();
}

//;; \subsection{camStopManagingGroup(group)}
//;; Tell \texttt{libcampaign.js} to stop managing a certain group.
function camStopManagingGroup(group)
{
	if (!camDef(__camGroupInfo[group]))
	{
		camTrace("Not managing", group, "anyway");
		return;
	}
	camTrace("Cease managing", group);
	delete __camGroupInfo[group];
}

//;; \subsection{camOrderToString(order)}
//;; Print campaign order as string, useful for debugging.
function camOrderToString(order)
{
	switch(order)
	{
		case CAM_ORDER_ATTACK:
			return "ATTACK";
		case CAM_ORDER_DEFEND:
			return "DEFEND";
		case CAM_ORDER_PATROL:
			return "DEFEND";
		default:
			return "UNKNOWN";
	}
}

//////////// privates

var __camGroupInfo;

const __CAM_TARGET_TRACKING_RADIUS = 10;
const __CAM_PLAYER_BASE_RADIUS = 20;
const __CAM_DEFENSE_RADIUS = 4;
const __CAM_CLOSE_RADIUS = 2;

function __camPickTarget(group)
{
	var targets = [];
	var gi = __camGroupInfo[group];
	switch(gi.order)
	{
		case CAM_ORDER_ATTACK:
			if (camDef(gi.target))
			{
				targets = enumRange(gi.target.x, gi.target.y,
									__CAM_TARGET_TRACKING_RADIUS,
									CAM_HUMAN_PLAYER, false);
			}
			if (!targets.length && camDef(gi.data.pos))
				targets = enumRange(gi.data.pos.x,
				                    gi.data.pos.y,
				                    __CAM_PLAYER_BASE_RADIUS,
				                    CAM_HUMAN_PLAYER, false);
			if (!targets.length)
				targets = enumStruct(CAM_HUMAN_PLAYER);
			if (!targets.length)
				targets = enumDroid(CAM_HUMAN_PLAYER);
			break;
		case CAM_ORDER_DEFEND:
			if (camDef(gi.target)
				&& camDist(gi.target, gi.data.pos) < __CAM_DEFENSE_RADIUS)
			{
				targets = enumRange(gi.target.x, gi.target.y,
									__CAM_TARGET_TRACKING_RADIUS,
									CAM_HUMAN_PLAYER, false);
			}
			if (!targets.length)
				targets = enumRange(gi.data.pos.x, gi.data.pos.y,
				                    __CAM_DEFENSE_RADIUS,
				                    CAM_HUMAN_PLAYER, false);
			if (!targets.length)
				targets = [ gi.data.pos ];
			break;
		default:
			camDebug("Unknown group order", gi.order);
			break;
	}
	if (!targets.length)
		return undefined;
	var target = targets[camRand(targets.length)];
	// sanitize data to make sure no bad things happen when object dies
	target = { x : target.x, y : target.y }
	__camGroupInfo[group].target = target;
	return target;
}

function __camTacticsTick()
{
	for (group in __camGroupInfo)
	{
		var gi = __camGroupInfo[group];
		var droids = enumGroup(group);
		switch(gi.order)
		{
			case CAM_ORDER_ATTACK:
			case CAM_ORDER_DEFEND:
				var target = __camPickTarget(group);
				if (!camDef(target))
					continue;
				for (var i = 0; i < droids.length; ++i)
				{
					var droid = droids[i];
					var done = false;
					if (gi.order === CAM_ORDER_DEFEND)
					{
						// fall back to defense position
						var dist = camDist(droid, gi.data.pos);
						if (dist > __CAM_DEFENSE_RADIUS)
						{
							orderDroidLoc(droid, DORDER_MOVE,
							              gi.data.pos.x, gi.data.pos.y);
							done = true;
						}
					}
					if (!done && droid.order !== DORDER_SCOUT
						&& camDist(droid, target) >= __CAM_CLOSE_RADIUS)
					{
						orderDroidLoc(droid, DORDER_SCOUT,
						              target.x, target.y);
					}
				}
				break;
			case CAM_ORDER_PATROL:
				if (!camDef(gi.lastmove) || !camDef(gi.lastspot))
				{
					gi.lastspot = 0;
				}
				else
				{
					if (gameTime - gi.lastmove < gi.data.interval)
						continue;
					// find random new position to visit
					var list = [];
					for (var i = 0; i < gi.data.pos.length; ++i)
						if (i !==gi.lastpos)
							list[list.length] = i;
					gi.lastspot = list[camRand(list.length)];
				}
				gi.lastmove = gameTime;
				var pos = camMakePos(gi.data.pos[gi.lastspot]);
				for (var i = 0; i < droids.length; ++i)
				{
					var droid = droids[i];
					orderDroidLoc(droid, DORDER_MOVE, pos.x, pos.y);
				}
				break;
			default:
				camDebug("Unknown group order", gi.order);
				break;
		}
	}
}

function __camCheckGroupMorale(group) {
	var gi = __camGroupInfo[group];
	if (!camDef(gi.data.morale))
		return;
	// morale is %.
	var msize = Math.floor((100 - gi.data.morale) * gi.count / 100);
	var gsize = groupSize(group);
	switch(gi.order)
	{
		case CAM_ORDER_ATTACK:
			if (gsize > msize)
				break;
			camTrace("Group", group, "falls back");
			gi.order = CAM_ORDER_DEFEND;
			// swap pos and fallback
			var temp = gi.data.pos;
			gi.data.pos = gi.data.fallback;
			gi.data.fallback = temp;
			// apply orders instantly
			__camTacticsTick();
			break;
		case CAM_ORDER_DEFEND:
			if (gsize <= msize)
				break;
			camTrace("Group", group, "restores");
			gi.order = CAM_ORDER_ATTACK;
			// swap pos and fallback
			var temp = gi.data.pos;
			gi.data.pos = gi.data.fallback;
			gi.data.fallback = temp;
			// apply orders instantly
			__camTacticsTick();
			break;
		default:
			camDebug("Unknown group order", gi.order);
			break;
	}
}


////////////////////////////////////////////////////////////////////////////////
// Factory production management.
////////////////////////////////////////////////////////////////////////////////
// To use this feature, call camSetFactories() with a list of factories.
// This assumes tactical management of groups of units produced from them.
// Factories won't start production immediately; call camEnableFactory()
// to turn them on.

//;; \subsection{camSetFactories(factories)}
//;; Tell \texttt{libcampaign.js} to manage a certain set of enemy factories.
//;; Management assumes producing droids, packing them into groups and
//;; executing orders once the group becomes large-enough.
//;; The argument is a JavaScript map from group labels to factory descriptions.
//;; Each label points to a factory object. Factory description
//;; is a JavaScript object with the following fields:
//;; \begin{description}
//;; 	\item[assembly] A rally point position label, where the group would
//;; 	gather.
//;; 	\item[order] An order to execute for every group produced in the
//;; 	factory. Same as the order parameter for \texttt{camManageGroup()}.
//;; 	\item[data] Order data. Same as the data parameter for
//;; 	\texttt{camManageGroup()}.
//;; 	\item[groupSize] Number of droids to produce before executing the order.
//;; 	Also, if order is CAM_ORDER_ATTACK, data.count defaults to this value.
//;; 	\item[maxSize] Halt production when reaching that many droids in the
//;; 	factory group. Resume when some droids die. Unlimited if unspecified.
//;; 	\item[throttle] If defined, produce droids only every that many
//;; 	milliseconds, and keep the factory idle between ticks.
//;; 	\item[group] If defined, make the factory manage this group,
//;; 	otherwise create a new empty group to manage.
//;; 	Droids produced in the factory would automatically be
//;; 	added to the group, and order and data parameters
//;; 	would be applied to this group.
//;; 	\item[templates] List of droid templates to produce in the factory.
//;; 	Each template is a JavaScript object with the following fields:
//;; 	\begin{description}
//;; 		\item[body] Body stat name.
//;; 		\item[prop] Propulsion stat name.
//;; 		\item[weap] Weapon stat name. Only single-turret droids are
//;; 		currently supported.
//;; 	\end{description}
//;; 	Note that all template components are automatically made available
//;; 	to the factory owner.
//;; \end{description}
//;; Factories won't start production immediately; call
//;; \texttt{camEnableFactory()} to turn them on when necessary.
function camSetFactories(factories)
{
	for (var flabel in factories)
		camSetFactoryData(flabel, factories[flabel]);
}

//;; \subsection{camSetFactoryData(factory label, factory description)}
//;; Similar to \texttt{camSetFactories()}, but one factory at a time.
//;; If the factory was already managing a group of droids, it keeps
//;; managing it. If a new group is specified in the description,
//;; the old group is merged into it.
function camSetFactoryData(flabel, fdata)
{
	// remember the old factory group, if any
	var droids = [];
	if (camDef(__camFactoryInfo[flabel]))
		droids = enumGroup(__camFactoryInfo[flabel].group);
	__camFactoryInfo[flabel] = fdata;
	var structure = getObject(flabel);
	if (!camDef(structure) || !structure)
	{
		camDebug("Factory", flabel, "not found");
		continue;
	}
	var fi = __camFactoryInfo[flabel];
	fi.enabled = false;
	fi.state = 0;
	if (!camDef(fi.group))
		fi.group = newGroup();
	for (var i = 0; i < droids.length; ++i)
		groupAdd(fi.group, droids[i]);
	if (!camDef(fi.data.count))
		fi.data.count = fi.groupSize;
	if (camDef(fi.assembly))
	{
		var pos = camMakePos(fi.assembly);
		setAssemblyPoint(structure, pos.x, pos.y);
	}
	// automatically make templates available.
	for (var i = 0; i < fi.templates.length; ++i)
	{
		makeComponentAvailable(fi.templates[i].body, structure.player);
		makeComponentAvailable(fi.templates[i].prop, structure.player);
		makeComponentAvailable(fi.templates[i].weap, structure.player);
	}
}

//;; \subsection{camEnableFactory(factory label)}
//;; Enable a managed factory by the given label. Once the factory is enabled,
//;; it starts producing units and executing orders as given.
function camEnableFactory(flabel)
{
	var fi = __camFactoryInfo[flabel];
	if (!camDef(fi) || !fi)
	{
		camDebug("Factory not managed", flabel);
		return;
	}
	if (fi.enabled)
	{
		// safe, no error
		camTrace("Factory", flabel, "enabled twice");
		return;
	}
	fi.enabled = true;
	var obj = getObject(flabel);
	if (!camDef(obj) || !obj)
	{
		camTrace("Factory", flabel, "not found, probably already dead");
		return;
	}
	camTrace("Enabling", flabel);
	__camContinueProduction(flabel);
}

//////////// privates

var __camFactoryInfo;

function __camAddDroidToFactoryGroup(droid, structure)
{
	// FIXME: O(n) lookup here
	var flabel = getLabel(structure);
	if (!camDef(flabel) || !flabel)
		return;
	var fi = __camFactoryInfo[flabel];
	groupAdd(fi.group, droid);
	var droids = enumGroup(fi.group);
	if (droids.length >= fi.groupSize)
	{
		camManageGroup(fi.group, fi.order, fi.data);
	}
	else
	{
		var pos = camMakePos(fi.assembly);
		if (!camDef(pos))
			pos = camMakePos(factory);
		camManageGroup(fi.group, CAM_ORDER_DEFEND, { pos: pos });
	}
}

function __camContinueProduction(structure)
{
	var flabel, struct;
	if (camIsString(structure))
	{
		flabel = structure;
		struct = getObject(flabel);
		if (!camDef(struct) || !struct)
		{
			camTrace("Factory not found");
			return;
		}
	}
	else
	{
		// FIXME: O(n) lookup here
		flabel = getLabel(structure);
		struct = structure;
	}
	if (!structureIdle(struct))
	{
		camDebug("Already enabled?");
		return;
	}
	if (!camDef(flabel) || !flabel)
		return;
	var fi = __camFactoryInfo[flabel];
	if (camDef(fi.maxSize) && groupSize(fi.group) >= fi.maxSize)
	{
		// retry in 5 seconds
		queue("__camContinueProduction", 5000, flabel);
		return;
	}
	if (camDef(fi.throttle) && camDef(fi.lastprod))
	{
		var throttle = gameTime - fi.lastprod;
		if (throttle < fi.throttle)
		{
			// do throttle
			queue("__camContinueProduction",
			      fi.throttle - throttle, flabel);
			return;
		}
	}
	var t = fi.templates[fi.state];
	var n = [ struct.name, struct.id, fi.state ].join(" ");
	// multi-turret templates are not supported yet
	buildDroid(struct, n, t.body, t.prop, 0, 0, t.weap);
	// loop through templates
	++fi.state;
	if (fi.state >= fi.templates.length)
		fi.state = 0;
	fi.lastprod = gameTime;
}


////////////////////////////////////////////////////////////////////////////////
// Victory celebration helpers.
////////////////////////////////////////////////////////////////////////////////


//;; \subsection{camNextLevel(next level)}
//;; A wrapper around \texttt{loadLevel()}. Remembers to give bonus power
//;; for completing the mission faster - 25 percent more than what you could have
//;; received by milking this time limit down.
function camNextLevel(nextLevel)
{
	var bonusTime = getMissionTime();
	if (bonusTime > 0)
	{
		camTrace("Bonus time", bonusTime);
		setPowerModifier(125); // 25% bonus to completing fast
		extraPowerTime(bonusTime);
		setPowerModifier(100);
	}
	loadLevel(nextLevel);
}

const CAM_VICTORY_STANDARD = 0;

//;; \subsection{camSetStandardWinLossConditions(kind, nextLevel)}
//;; Set victory and defeat conditions to one of the common
//;; options. On victory, load nextLevel. The following
//;; options are available:
//;; \begin{description}
//;; 	\item[CAM_VICTORY_STANDARD] Defeat if all ground factories
//;; 	and construction droids are lost. Victory when all enemy bases
//;; 	are destroyed and all artifacts are recovered.
//;; \end{description}
function camSetStandardWinLossConditions(kind, nextLevel)
{
	switch(kind)
	{
		case CAM_VICTORY_STANDARD:
			__camWinLossCallback = "__camVictoryStandard";
			break;
		default:
			camDebug("Unknown standard victory condition", kind);
			break;
	}
	__camNextLevel = nextLevel;
}

//////////// privates

var __camWinLossCallback;
var __camNextLevel;
var __camWinLossAlreadyFired;

function __camGameLost()
{
	camTrace();
	gameOverMessage(false);
}

function __camGameWon()
{
	camTrace(__camNextLevel);
	if (camDef(__camNextLevel))
		camNextLevel(__camNextLevel);
}

function __camVictoryStandard()
{
	if (__camWinLossAlreadyFired)
		return;
	// check if game is lost
	var factories = countStruct("A0LightFactory")
	              + countStruct("A0CyborgFactory");
	var droids = countDroid(DROID_CONSTRUCT);
	if (droids === 0 && factories === 0) {
		queue("__camGameLost", 4000); // wait 4 secs before throwing the game
		__camWinLossAlreadyFired = true;
	}
	// check if game is won
	if (camAllArtifactsPickedUp() && camAllEnemyBasesEliminated()) {
		queue("__camGameWon", 6000); // wait 6 secs before giving it
		__camWinLossAlreadyFired = true;
	}
}


////////////////////////////////////////////////////////////////////////////////
// Event hooks magic. This makes all the library catch all the necessary events
// without distracting the script authors from handling them on their own.
// It assumes that script authors do not implement another similar mechanism,
// or something BAD would happen.
////////////////////////////////////////////////////////////////////////////////


//;; \subsection{camAreaEvent(label, filter, function(droid))}
//;; Implement eventArea<label> in a convenient way. The function callback
//;; would be executed every time a droid (belonging to a player
//;; that matches the filter) enters the area for the first time
//;; (use \texttt{resetArea()} to restart anew). \textbf{filter} can be one of
//;; a player index, ALL_PLAYERS, ALLIES or ENEMIES. The function
//;; marks the area until the event is triggered.
function camAreaEvent(label, filter, code)
{
	var eventName = "eventArea" + label;
	camMarkTiles(label);
	__camPreHookEvent(eventName, function(droid)
	{
		if (!camPlayerMatchesFilter(droid.player, filter))
		{
			camTraceOnce("Suppressing", label, "for player", droid.player);
			resetArea(label);
			return;
		}
		camTrace("Player", droid.player, "enters", label);
		camUnmarkTiles(label);
		code(droid);
	});
}

//////////// privates

var __camOriginalEvents = {};

function __camPreHookEvent(eventname, hookcode)
{
	// store the original event handler
	if (camDef(__camGlobalContext[eventname]))
		__camOriginalEvents[eventname] = __camGlobalContext[eventname];
	__camGlobalContext[eventname] = function()
	{
		hookcode.apply(__camGlobalContext, arguments);
		if (camDef(__camOriginalEvents[eventname]))
			__camOriginalEvents[eventname].apply(__camGlobalContext, arguments);
	};
}


/* Called every second after eventStartLevel(). */
function __camTick()
{
	__camTacticsTick();
	if (camDef(__camWinLossCallback))
		__camGlobalContext[__camWinLossCallback]();
}

var __camLastHitTime = 0;

const __CAM_EVENT_ATTACKED_INTENSITY = 5000;

__camPreHookEvent("eventPickup", function(feature, droid)
{
	if (feature.stattype === ARTIFACT)
	{
		__camPickupArtifact(feature);
	}
});

__camPreHookEvent("eventAttacked", function(victim, attacker)
{
	if (gameTime > __camLastHitTime + __CAM_EVENT_ATTACKED_INTENSITY)
	{
		__camLastHitTime = gameTime;
		if (victim.type === STRUCTURE)
			playSound("pcv337.ogg", victim.x, victim.y, victim.z);
		else
			playSound("pcv399.ogg", victim.x, victim.y, victim.z);
	}
});

__camPreHookEvent("eventGroupLoss", function(obj, group, newsize)
{
	if (newsize === 0)
		__camCheckBaseEliminated(group);
	if (camDef(__camGroupInfo[group]))
		__camCheckGroupMorale(group);
});

__camPreHookEvent("eventCheatMode", function(entered)
{
	if (entered)
	{
		__camCheatMode = true;
		camTrace("Cheats enabled!");
	}
	else
	{
		camTrace("Cheats disabled!");
		__camCheatMode = false;
	}
	__camUpdateMarkedTiles();
});

__camPreHookEvent("eventChat", function(from, to, message)
{
	if (!__camCheatMode)
		return;
	camTrace(from, to, message);
	if (message === "let me win")
		__camLetMeWin();
	if (message === "win info")
		__camWinInfo();
});

__camPreHookEvent("eventStartLevel", function()
{
	// Variables initialized here are the ones that should not be
	// re-initialized on save-load. Otherwise, they are initialized
	// on the global scope (or wherever necessary).
	__camGroupInfo = {};
	__camFactoryInfo = {};
	isReceivingAllEvents = true;
	__camWinLossAlreadyFired = false;
	setTimer("__camTick", 5000);
});

__camPreHookEvent("eventDroidBuilt", function(droid, structure)
{
	if (!camPlayerMatchesFilter(structure.player, ENEMIES))
		return;
	if (!camDef(__camFactoryInfo))
		return;
	__camContinueProduction(structure);
	__camAddDroidToFactoryGroup(droid, structure);
});

__camPreHookEvent("eventDestroyed", function(obj)
{
	__camCheckPlaceArtifact(obj);
});

__camPreHookEvent("eventObjectSeen", function(viewer, seen)
{
	__camCheckBaseSeen(seen);
});
