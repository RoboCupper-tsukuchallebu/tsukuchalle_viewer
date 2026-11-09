`missionCdr.json` は ROS 2 Jazzy の `rclpy.serialization.serialize_message` で生成した CDR です。型は lightweight-nav-stack の develop の lightnav_msgs を使います。ビルド機の `/tmp` で次のように再生成します。対象リポジトリのリビジョンも記録し、差分を確認してください。

```sh
mkdir -p /tmp/mission-cdr && cd /tmp/mission-cdr
git clone --branch develop https://github.com/RoboCupper-tsukuchallebu/lightweight-nav-stack.git source
mkdir -p ws/src
cp -r source/src/lightnav_msgs ws/src/
# このリポジトリの scripts/generate_mission_cdr.py を /tmp/mission-cdr にコピーする
docker run --rm -v "$PWD:/work" ros:jazzy bash -lc '
  source /opt/ros/jazzy/setup.bash
  cd /work/ws && colcon build --packages-select lightnav_msgs
  source install/setup.bash
  python3 /work/generate_mission_cdr.py > /work/missionCdr.json
'
```

生成した JSON を `test/fixtures/missionCdr.json` にコピーします。bridge から採取した message data は含まれていません。

生成に使った lightweight-nav-stack のリビジョン: `1b198ecbba851c79f2ec66287344289d8545294e`。
