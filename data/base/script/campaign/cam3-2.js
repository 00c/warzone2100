include("script/campaign/libcampaign.js");
include("script/campaign/templates.js");
include("script/campaign/transitionTech.js");

const ALPHA = 1; //Team alpha units belong to player 1.
const NEXUS_RES = [
	"R-Defense-WallUpgrade08", "R-Struc-Materials08", "R-Struc-Factory-Upgrade06",
	"R-Struc-Factory-Cyborg-Upgrade06", "R-Struc-VTOLFactory-Upgrade06",
	"R-Struc-VTOLPad-Upgrade06", "R-Vehicle-Engine09", "R-Vehicle-Metals07",
	"R-Cyborg-Metals07", "R-Vehicle-Armor-Heat05", "R-Cyborg-Armor-Heat05",
	"R-Sys-Engineering03", "R-Vehicle-Prop-Hover02", "R-Vehicle-Prop-VTOL02",
	"R-Wpn-Bomb-Accuracy03", "R-Wpn-Energy-Accuracy01", "R-Wpn-Energy-Damage02",
	"R-Wpn-Energy-ROF02", "R-Wpn-Missile-Accuracy01", "R-Wpn-Missile-Damage01",
	"R-Wpn-Rail-Damage02", "R-Wpn-Rail-ROF02", "R-Sys-Sensor-Upgrade01",
	"R-Sys-NEXUSrepair", "R-Wpn-Flamer-Damage06",
];
var edgeMapIndex;
var alphaUnitIDs;

//Remove Nexus VTOL droids.
camAreaEvent("vtolRemoveZone", function(droid)
{
	if (droid.player !== CAM_HUMAN_PLAYER)
	{
		if (isVTOL(droid))
		{
			camSafeRemoveObject(droid, false);
		}
	}

	resetLabel("vtolRemoveZone", NEXUS);
});

//This is an area just below the "doorway" into the alpha team pit. Activates
//groups that are hidden farther south.
camAreaEvent("rescueTrigger", function(droid)
{
	camManageGroup(camMakeGroup("laserTankGroup"), CAM_ORDER_ATTACK, {
		regroup: true,
		count: -1,
		morale: 90,
		fallback: camMakePos("healthRetreatPos")
	});
});

function playVideos()
{
	camPlayVideos(["MB3_2_MSG3", "MB3_2_MSG4"]);
}

//Activate edge map queues and play videos, donate alpha to the player, setup reinforcements.
camAreaEvent("phantomFacTrigger", function(droid)
{
	queue("phantomFactoryNE", camChangeOnDiff(180000)); //3 min;
	queue("phantomFactorySW", camChangeOnDiff(240000)); //4 min;
	queue("phantomFactorySE", camChangeOnDiff(360000)); //6 min;

	setAlliance(ALPHA, NEXUS, false);
	playSound("pcv456.ogg"); //Incoming transmission...
	queue("playVideos", 2000);
	//Donate All of alpha to the player.
	camAbsorbPlayer(ALPHA, CAM_HUMAN_PLAYER);

	hackRemoveMessage("C3-2_OBJ1", PROX_MSG, CAM_HUMAN_PLAYER);
	queue("getAlphaUnitIDs", 3000);
	queue("enableReinforcements", 5000);
});

//Get the IDs of Alpha units after they were donated to the player. Set Experience
//while we are at it.
function getAlphaUnitIDs()
{
	const DROID_EXP = 512; //Hero rank.
	if (!camDef(alphaUnitIDs))
	{
		alphaUnitIDs = [];
	}

	var alphaDroids = enumArea("alphaPit", CAM_HUMAN_PLAYER, false).filter(function(obj) {
		return (obj.type === DROID);
	});

	for (var i = 0, l = alphaDroids.length; i < l; ++i)
	{
		var dr = alphaDroids[i];
		if (!camIsSystemDroid(dr))
		{
			setDroidExperience(dr, DROID_EXP);
		}
		alphaUnitIDs.push(dr.id);
	}
}

function phantomFactoryNE()
{
	var list; with (camTemplates) list = [nxcyrail, nxcyscou, nxcylas, nxlflash];
	sendEdgeMapDroids(4, "NE-PhantomFactory", list);
	queue("phantomFactoryNE", camChangeOnDiff(180000)); //3 min;
}

function phantomFactorySW()
{
	var list; with (camTemplates) list = [nxcyrail, nxcyscou, nxcylas, nxlflash];
	sendEdgeMapDroids(6, "SW-PhantomFactory", list);
	queue("phantomFactorySW", camChangeOnDiff(240000)); //4 min;
}

function phantomFactorySE()
{
	var list; with (camTemplates) list = [nxcyrail, nxcyscou, nxcylas, nxlflash, nxmrailh, nxmlinkh];
	sendEdgeMapDroids(8 + camRand(5), "SE-PhantomFactory", list);
	queue("phantomFactorySE", camChangeOnDiff(360000)); //6 min;
}

function sendEdgeMapDroids(droidCount, location, list)
{
	var droids = [];
	for (var i = 0; i < droidCount; ++i)
	{
		droids.push(list[camRand(list.length)]);
	}

	camSendReinforcement(NEXUS, camMakePos(location), droids,
		CAM_REINFORCE_GROUND, {
			data: {regroup: true, count: -1}
		}
	);
}

function setupPatrolGroups()
{
	camManageGroup(camMakeGroup("cyborgGroup1"), CAM_ORDER_ATTACK, {
		regroup: true,
		count: -1,
		morale: 90,
		fallback: camMakePos("healthRetreatPos")
	});

	camManageGroup(camMakeGroup("cyborgGroup2"), CAM_ORDER_PATROL, {
		pos: [
			camMakePos("upperMiddlePos"),
			camMakePos("upperMiddleEastPos"),
			camMakePos("playerLZ"),
			camMakePos("upperMiddleWest"),
			camMakePos("upperMiddleHill"),
		],
		interval: 20000,
		regroup: true,
		count: -1
	});

	camManageGroup(camMakeGroup("cyborgGroup3"), CAM_ORDER_PATROL, {
		pos: [
			camMakePos("upperMiddleWest"),
			camMakePos("upperMiddleHill"),
			camMakePos("lowerMiddleEast"),
			camMakePos("lowerMiddleHill"),
		],
		interval: 20000,
		regroup: true,
		count: -1
	});

	camManageGroup(camMakeGroup("cyborgGroup4"), CAM_ORDER_PATROL, {
		pos: [
			camMakePos("lowerMiddleEast"),
			camMakePos("lowerMiddleHill"),
			camMakePos("lowerMiddleWest"),
			camMakePos("SWCorner"),
			camMakePos("alphaDoorway"),
		],
		interval: 25000,
		regroup: true,
		count: -1
	});

	camManageGroup(camMakeGroup("cyborgGroup5"), CAM_ORDER_PATROL, {
		pos: [
			camMakePos("upperMiddlePos"),
			camMakePos("upperMiddleEastPos"),
			camMakePos("playerLZ"),
			camMakePos("upperMiddleWest"),
			camMakePos("upperMiddleHill"),
			camMakePos("lowerMiddleEast"),
			camMakePos("lowerMiddleHill"),
			camMakePos("lowerMiddleWest"),
			camMakePos("SWCorner"),
			camMakePos("alphaDoorway"),
			camMakePos("NE-PhantomFactory"),
			camMakePos("SW-PhantomFactory"),
			camMakePos("SE-PhantomFactory"),
		],
		interval: 35000,
		regroup: true,
		count: -1
	});
}

//Setup Nexus VTOL hit and runners. NOTE: These do not go away in this mission.
function vtolAttack()
{
	var list; with (camTemplates) list = [nxlscouv, nxmtherv];
	var ext = {
		limit: [2, 4], //paired with template list
		alternate: true,
		altIdx: 0
	};
	camSetVtolData(NEXUS, "vtolAppearPos", "vtolRemovePos", list, camChangeOnDiff(120000), undefined, ext); //2 min
}

//reinforcements not available until team Alpha brief about VTOLS.
function enableReinforcements()
{
	const REINFORCEMENT_TIME = 180; //3 minute.
	playSound("pcv440.ogg"); // Reinforcements are available.
	camSetStandardWinLossConditions(CAM_VICTORY_OFFWORLD, "CAM3A-B", {
		area: "RTLZ",
		reinforcements: REINFORCEMENT_TIME,
		callback: "alphaTeamAlive"
	});
}

function alphaTeamAlive()
{
	if (camDef(alphaUnitIDs))
	{
		var alphaAlive = false;
		var alive = enumArea(0, 0, mapWidth, mapHeight, CAM_HUMAN_PLAYER, false).filter(function(obj) {
			return (obj.type === DROID);
		});
		var allDroidsAtLZ = enumArea("RTLZ", CAM_HUMAN_PLAYER, false).filter(function(obj) {
			return (obj.type === DROID);
		});

		for (var i = 0, l = alive.length; i < l; ++i)
		{
			for (var x = 0, c = alphaUnitIDs.length; x < c; ++x)
			{
				if (alive[i].id === alphaUnitIDs[x])
				{
					alphaAlive = true;
					break;
				}
			}
		}

		if (!alphaAlive)
		{
			playSound("pcv622.ogg"); //objective destroyed.
			return false;
		}

		if (alphaAlive && (alive.length === allDroidsAtLZ.length))
		{
			enableResearch("R-Sys-Resistance-Upgrade01", CAM_HUMAN_PLAYER);
			return true;
		}
	}
}

function eventStartLevel()
{
	const ALPHA_POWER = 5000;
	var startpos = getObject("startPosition");
	var lz = getObject("landingZone");
	var tent = getObject("transporterEntry");
	var text = getObject("transporterExit");

	camSetStandardWinLossConditions(CAM_VICTORY_OFFWORLD, "CAM3A-B", {
		area: "RTLZ",
		reinforcements: -1,
		callback: "alphaTeamAlive"
	});

	centreView(startpos.x, startpos.y);
	setNoGoArea(lz.x, lz.y, lz.x2, lz.y2, CAM_HUMAN_PLAYER);
	startTransporterEntry(tent.x, tent.y, CAM_HUMAN_PLAYER);
	setTransporterExit(text.x, text.y, CAM_HUMAN_PLAYER);

	setPower(AI_POWER, NEXUS);
	setPower(ALPHA_POWER, ALPHA);
	camCompleteRequiredResearch(NEXUS_RES, NEXUS);
	camCompleteRequiredResearch(GAMMA_ALLY_RES, ALPHA);
	setAlliance(ALPHA, NEXUS, true);
	setAlliance(ALPHA, CAM_HUMAN_PLAYER, true);

	hackAddMessage("C3-2_OBJ1", PROX_MSG, CAM_HUMAN_PLAYER);
	queue("setupPatrolGroups", 15000);
	queue("vtolAttack", camChangeOnDiff(300000)); //5 min
}
