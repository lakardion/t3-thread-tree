/** Apple on-device model helper. `check` prints availability; `run` reads {guide,input,schema} from stdin and prints {"answer":…}. Errors print {"error":…} and exit 1; a crash exits 2. */
import Foundation
import FoundationModels

struct Request: Decodable {
  let guide: String
  let input: String
  let schema: GenerationSchema
}

/** Tokens kept free for the model's answer. */
let reserve = 600

func emit(_ obj: [String: Any], code: Int32) -> Never {
  let data = try! JSONSerialization.data(withJSONObject: obj)
  print(String(data: data, encoding: .utf8)!)
  exit(code)
}

func fail(_ error: String, _ extra: [String: Any] = [:]) -> Never {
  emit(["error": error].merging(extra) { a, _ in a }, code: 1)
}

func crash(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(2)
}

let model = SystemLanguageModel(useCase: .general, guardrails: .default)

func reason(of availability: SystemLanguageModel.Availability) -> String? {
  guard case .unavailable(let r) = availability else { return nil }
  switch r {
  case .deviceNotEligible: return "deviceNotEligible"
  case .appleIntelligenceNotEnabled: return "appleIntelligenceNotEnabled"
  case .modelNotReady: return "modelNotReady"
  @unknown default: return "\(r)"
  }
}

switch CommandLine.arguments.dropFirst().first {
case "check":
  if let r = reason(of: model.availability) {
    emit(["available": false, "reason": r], code: 0)
  }
  emit(["available": true, "contextSize": model.contextSize], code: 0)
case "run":
  if let r = reason(of: model.availability) { fail("unavailable", ["reason": r]) }
  do {
    let body = FileHandle.standardInput.readDataToEndOfFile()
    let req = try JSONDecoder().decode(Request.self, from: body)
    let instructions = Instructions(req.guide)
    let count =
      try await model.tokenCount(for: instructions)
      + model.tokenCount(for: Prompt(req.input))
      + model.tokenCount(for: req.schema)
    if count + reserve > model.contextSize {
      fail("overflow", ["tokens": count, "limit": model.contextSize - reserve])
    }
    let session = LanguageModelSession(model: model, instructions: instructions)
    let response = try await session.respond(to: req.input, schema: req.schema)
    print("{\"answer\":\(response.content.jsonString)}")
    exit(0)
  } catch let e as LanguageModelSession.GenerationError {
    switch e {
    case .exceededContextWindowSize: fail("contextWindow")
    case .assetsUnavailable: fail("unavailable", ["reason": "assetsUnavailable"])
    case .guardrailViolation: fail("guardrail")
    case .refusal: fail("refusal")
    case .decodingFailure, .unsupportedGuide: fail("decoding")
    case .rateLimited, .concurrentRequests: fail("busy")
    case .unsupportedLanguageOrLocale: fail("locale")
    @unknown default: crash("\(e)")
    }
  } catch {
    crash("\(error)")
  }
default:
  crash("usage: apple-model check|run")
}
