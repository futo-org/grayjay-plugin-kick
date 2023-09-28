#!/bin/sh
DOCUMENT_ROOT=/var/www/sources

# Take site offline
echo "Taking site offline..."
touch $DOCUMENT_ROOT/maintenance.file

# Swap over the content
echo "Deploying content..."
mkdir -p $DOCUMENT_ROOT/Kick
cp kick.png $DOCUMENT_ROOT/Kick
cp KickConfig.json $DOCUMENT_ROOT/Kick
cp KickScript.js $DOCUMENT_ROOT/Kick
sh sign.sh $DOCUMENT_ROOT/Kick/KickScript.js $DOCUMENT_ROOT/Kick/KickConfig.json

# Notify Cloudflare to wipe the CDN cache
echo "Purging Cloudflare cache for zone $CLOUDFLARE_ZONE_ID..."
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"files":["https://plugins.grayjay.app/Kick/kick.png", "https://plugins.grayjay.app/Kick/KickConfig.json", "https://plugins.grayjay.app/Kick/KickScript.js"]}'

# Take site back online
echo "Bringing site back online..."
rm $DOCUMENT_ROOT/maintenance.file
