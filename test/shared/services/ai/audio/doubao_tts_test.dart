// 职责: 验证豆包 2.0 语音请求把多轮上文、语音指令和语速映射到协议字段。
// 关联文件:
//   lib/shared/services/ai/audio/doubao_tts.dart
//   lib/shared/models/audio/config.dart
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:reveric/shared/models/audio/config.dart';
import 'package:reveric/shared/models/audio/request.dart';
import 'package:reveric/shared/services/ai/audio/doubao_tts.dart';

void main() {
  DoubaoTtsClient client() => DoubaoTtsClient(
    http.Client(),
    'test-key',
    providerType: 'doubao_audio',
    resourceId: 'seed-tts-2.0',
  );

  AudioRequest request({List<String> contexts = const [], double? speed}) =>
      AudioRequest(
        providerId: 'prv_test',
        modelId: 'seed-tts-2.0',
        prompt: '你不是刚下夜班吗？',
        originalPrompt: '你不是刚下夜班吗？',
        parameters: AudioRequestDefaults(
          voice: const ConfigValue('zh_male_qingshuangnanda_uranus_bigtts'),
          instructions: const ConfigValue('[#带着怀念、轻声确认]'),
          contexts: contexts.isEmpty ? null : ConfigValue(contexts),
          speed: speed == null ? null : ConfigValue(speed),
          responseFormat: const ConfigValue('mp3'),
        ),
      );

  Map<String, dynamic> encode(AudioRequest value) =>
      (client().encode(value)['req_params'] as Map<String, dynamic>);

  test('上文在前、语音指令在后，并映射 speech_rate', () {
    final params = encode(
      request(contexts: ['程微：平时不是说，女朋友送什么都吃？'], speed: 0.99),
    );
    final additions = jsonDecode(params['additions'] as String);
    expect(additions['context_texts'], [
      '程微：平时不是说，女朋友送什么都吃？',
      '[#带着怀念、轻声确认]',
    ]);
    expect(params['audio_params']['speech_rate'], -1);
  });

  test('没有上文和语速时不发空字段', () {
    final params = encode(request());
    expect(params.containsKey('additions'), isTrue);
    expect((jsonDecode(params['additions'] as String)['context_texts'] as List).length, 1);
    expect(params['audio_params'].containsKey('speech_rate'), isFalse);
  });

  test('语速倍率按 1.0 为 0 线性映射', () {
    expect(encode(request(speed: 0.9))['audio_params']['speech_rate'], -10);
    expect(encode(request(speed: 1.0))['audio_params']['speech_rate'], 0);
    expect(encode(request(speed: 1.2))['audio_params']['speech_rate'], 20);
  });
}
