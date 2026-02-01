#!/bin/bash
# Reset demo state for Darwin

echo "🧹 Flushing Redis..."
docker exec -it weavehacks-redis redis-cli FLUSHALL

echo "🔄 Resetting Joplin fork to upstream..."
cd ~/code/joplin
git checkout dev
git fetch upstream
git reset --hard upstream/dev
git push -f origin dev

# Delete any darwin branches
git branch -r | grep 'darwin/' | sed 's/origin\///' | xargs -I {} git push origin --delete {} 2>/dev/null || true

echo "✅ Ready for next demo!"