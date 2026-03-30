Pod::Spec.new do |s|
  s.name           = 'ExpoFrameEncoder'
  s.version        = '0.0.1'
  s.summary        = 'Encode JPG frames to H.264 MP4 video'
  s.description    = 'Native video encoder using AVAssetWriter for iOS'
  s.author         = 'ibrah'
  s.homepage       = 'https://github.com/ib6'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
